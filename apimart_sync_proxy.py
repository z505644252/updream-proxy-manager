import argparse
import base64
import cgi
import json
import mimetypes
import os
import re
import tempfile
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import requests


APIMART_BASE_URL = os.environ.get("APIMART_BASE_URL", "https://api.aishuch.com/v1").rstrip("/")
DEFAULT_MODEL = os.environ.get("APIMART_IMAGE_MODEL", "gpt-image-2")
DEFAULT_FIRST_DELAY = int(os.environ.get("APIMART_FIRST_DELAY", "12"))
DEFAULT_POLL_INTERVAL = int(os.environ.get("APIMART_POLL_INTERVAL", "4"))
DEFAULT_TIMEOUT = int(os.environ.get("APIMART_TIMEOUT", "180"))


def now_seconds():
    return int(time.time())


def json_response(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def error_response(handler, status, message, error_type="proxy_error"):
    json_response(handler, status, {"error": {"message": message, "type": error_type}})


def read_json_body(handler):
    length = int(handler.headers.get("Content-Length") or "0")
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def data_url_from_file(path, mime_type=None):
    mime_type = mime_type or mimetypes.guess_type(path)[0] or "image/png"
    with open(path, "rb") as file_obj:
        encoded = base64.b64encode(file_obj.read()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def normalize_image_value(value):
    if not value:
        return None
    if isinstance(value, dict):
        for key in ("url", "image", "image_url", "b64_json"):
            nested = value.get(key)
            if isinstance(nested, dict):
                nested = nested.get("url")
            image_value = normalize_image_value(nested)
            if image_value:
                return image_value
    if isinstance(value, str):
        return value
    return None


def first_image_from_payload(payload):
    candidates = []
    for key in ("image", "image_url", "reference_image", "reference_images", "images", "image_urls"):
        value = payload.get(key)
        if isinstance(value, list):
            candidates.extend(value)
        elif value:
            candidates.append(value)

    extra_body = payload.get("extra_body")
    if isinstance(extra_body, dict):
        for key in ("image", "image_url", "reference_image", "reference_images"):
            value = extra_body.get(key)
            if isinstance(value, list):
                candidates.extend(value)
            elif value:
                candidates.append(value)

    for value in candidates:
        image = normalize_image_value(value)
        if image:
            return image
    return None


def parse_multipart(handler):
    form = cgi.FieldStorage(
        fp=handler.rfile,
        headers=handler.headers,
        environ={
            "REQUEST_METHOD": "POST",
            "CONTENT_TYPE": handler.headers.get("Content-Type"),
        },
    )
    payload = {}
    temp_files = []
    for key in form.keys():
        field = form[key]
        fields = field if isinstance(field, list) else [field]
        values = []
        for item in fields:
            if item.filename:
                suffix = os.path.splitext(item.filename)[1] or ".png"
                fd, path = tempfile.mkstemp(prefix="apimart_upload_", suffix=suffix)
                with os.fdopen(fd, "wb") as file_obj:
                    file_obj.write(item.file.read())
                temp_files.append((key, path, item.type or "image/png"))
                values.append(data_url_from_file(path, item.type or "image/png"))
            else:
                values.append(item.value)
        payload[key] = values if len(values) > 1 else values[0]
    return payload, temp_files


def build_upstream_payload(payload, image=None):
    model = payload.get("model") or payload.get("model_name") or DEFAULT_MODEL
    upstream_payload = {
        "model": model,
        "prompt": payload.get("prompt") or "",
    }

    for key in ("size", "n", "quality", "response_format", "seed"):
        if payload.get(key) is not None:
            upstream_payload[key] = payload[key]

    if image:
        upstream_payload["image"] = image

    extra_body = payload.get("extra_body")
    if isinstance(extra_body, dict):
        upstream_payload.update({key: value for key, value in extra_body.items() if value is not None})

    return upstream_payload


def request_json(method, url, api_key, payload=None, timeout=60):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    response = requests.request(method, url, headers=headers, json=payload, timeout=timeout)
    if response.status_code >= 400:
        raise RuntimeError(f"upstream error {response.status_code}: {response.text[:1000]}")
    return response.json()


def extract_task_id(upstream):
    for key in ("task_id", "id"):
        if upstream.get(key):
            return upstream[key]
    data = upstream.get("data")
    if isinstance(data, dict):
        for key in ("task_id", "id"):
            if data.get(key):
                return data[key]
    raise RuntimeError(f"upstream did not return task_id: {json.dumps(upstream, ensure_ascii=False)[:1000]}")


def status_of(upstream):
    status = upstream.get("status")
    data = upstream.get("data")
    if not status and isinstance(data, dict):
        status = data.get("status")
    status = str(status or "running").lower()
    if status in ("succeeded", "success", "done", "finished"):
        return "completed"
    if status in ("failed", "error", "cancelled", "canceled"):
        return "failed"
    if status in ("completed", "running", "queued", "processing"):
        return status
    return "running"


def walk_image_urls(value, found=None):
    if found is None:
        found = []
    if isinstance(value, str):
        lower = value.lower()
        if value.startswith(("http://", "https://")) and re.search(r"\.(png|jpg|jpeg|webp)(\?|$)", lower):
            found.append(value)
        elif value.startswith(("http://", "https://")) and "/image" in lower:
            found.append(value)
    elif isinstance(value, list):
        for item in value:
            walk_image_urls(item, found)
    elif isinstance(value, dict):
        for item in value.values():
            walk_image_urls(item, found)
    return found


def extract_image_urls(upstream):
    urls = []
    data = upstream.get("data")
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                for key in ("url", "image_url", "image"):
                    if item.get(key):
                        urls.append(item[key])
            elif isinstance(item, str):
                urls.append(item)

    for key in ("url", "image_url", "image"):
        if upstream.get(key):
            urls.append(upstream[key])

    for key in ("images", "image_urls", "result_urls", "outputs", "result", "data"):
        urls.extend(walk_image_urls(upstream.get(key)))

    deduped = []
    for url in urls:
        if isinstance(url, str) and url not in deduped:
            deduped.append(url)
    return deduped


def submit_and_wait(api_key, payload, image=None, server=None):
    upstream_payload = build_upstream_payload(payload, image=image)
    submit = request_json(
        "POST",
        f"{APIMART_BASE_URL}/images/generations",
        api_key,
        payload=upstream_payload,
        timeout=60,
    )
    task_id = extract_task_id(submit)
    first_delay = getattr(server, "first_delay", DEFAULT_FIRST_DELAY)
    poll_interval = getattr(server, "poll_interval", DEFAULT_POLL_INTERVAL)
    timeout_seconds = getattr(server, "timeout_seconds", DEFAULT_TIMEOUT)
    deadline = time.time() + timeout_seconds
    time.sleep(first_delay)
    last_status = None

    while time.time() < deadline:
        task = request_json("GET", f"{APIMART_BASE_URL}/tasks/{task_id}", api_key, timeout=60)
        last_status = status_of(task)
        if last_status == "completed":
            urls = extract_image_urls(task)
            if not urls:
                raise RuntimeError(f"task completed but no images found: {json.dumps(task, ensure_ascii=False)[:1000]}")
            return {
                "created": now_seconds(),
                "data": [{"url": url} for url in urls],
                "task_id": task_id,
            }
        if last_status == "failed":
            raise RuntimeError(f"task failed: {json.dumps(task, ensure_ascii=False)[:1000]}")
        time.sleep(poll_interval)

    raise RuntimeError(f"task timed out, last_status={last_status}")


class APIMartSyncProxy(BaseHTTPRequestHandler):
    server_version = "APIMartSyncProxy/1.1"

    def log_message(self, fmt, *args):
        print(f"[apimart] {self.address_string()} - {fmt % args}", flush=True)

    def api_key(self):
        auth = self.headers.get("Authorization") or ""
        return auth.removeprefix("Bearer ").strip()

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/health", "/v1/health"):
            json_response(self, 200, {"status": "ok", "upstream": APIMART_BASE_URL})
            return
        if path == "/v1/models":
            json_response(self, 200, {"object": "list", "data": [{"id": DEFAULT_MODEL, "object": "model"}]})
            return
        error_response(self, 404, "not found")

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ("/v1/images/generations", "/v1/images/edits"):
            error_response(self, 404, "not found")
            return
        api_key = self.api_key()
        if not api_key:
            error_response(self, 401, "missing api key")
            return

        temp_files = []
        try:
            content_type = self.headers.get("Content-Type", "")
            if content_type.startswith("multipart/form-data"):
                payload, temp_files = parse_multipart(self)
                image = first_image_from_payload(payload)
            else:
                payload = read_json_body(self)
                image = first_image_from_payload(payload) if path.endswith("/edits") else None

            result = submit_and_wait(api_key, payload, image=image, server=self.server)
            json_response(self, 200, result)
        except Exception as error:
            print(f"[apimart] error: {error}", flush=True)
            error_response(self, 500, str(error), "upstream_error")
        finally:
            for _key, file_path, _mime_type in temp_files:
                try:
                    os.remove(file_path)
                except OSError:
                    pass


class ProxyServer(ThreadingHTTPServer):
    def __init__(self, server_address, handler_class, first_delay, poll_interval, timeout_seconds):
        super().__init__(server_address, handler_class)
        self.first_delay = first_delay
        self.poll_interval = poll_interval
        self.timeout_seconds = timeout_seconds


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--first-delay", type=int, default=DEFAULT_FIRST_DELAY)
    parser.add_argument("--poll-interval", type=int, default=DEFAULT_POLL_INTERVAL)
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    parser.add_argument("--no-kill-port", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    server = ProxyServer((args.host, args.port), APIMartSyncProxy, args.first_delay, args.poll_interval, args.timeout)
    print(f"[apimart] listening on http://{args.host}:{args.port}/v1 -> {APIMART_BASE_URL}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
