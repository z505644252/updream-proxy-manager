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


UPSTREAM_BASE_URL = os.environ.get("AGNES_BASE_URL", "https://apihub.agnes-ai.com/v1").rstrip("/")
DEFAULT_MODEL = os.environ.get("AGNES_IMAGE_MODEL", "agnes-image-2.1-flash")
REQUEST_TIMEOUT = int(os.environ.get("AGNES_REQUEST_TIMEOUT", "180"))


def now_seconds():
    return int(time.time())


def json_response(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def error_response(handler, status, message):
    json_response(handler, status, {"error": {"message": message, "type": "proxy_error"}})


def read_json_body(handler):
    length = int(handler.headers.get("Content-Length") or "0")
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def data_url_to_file(data_url):
    match = re.match(r"^data:([^;]+);base64,(.+)$", data_url, re.S)
    if not match:
        raise ValueError("invalid data url")
    mime_type = match.group(1)
    suffix = mimetypes.guess_extension(mime_type) or ".png"
    data = base64.b64decode(match.group(2))
    fd, path = tempfile.mkstemp(prefix="agnes_ref_", suffix=suffix)
    with os.fdopen(fd, "wb") as file_obj:
        file_obj.write(data)
    return path, mime_type


def upload_temp_image(path, mime_type=None):
    mime_type = mime_type or mimetypes.guess_type(path)[0] or "image/png"
    file_name = os.path.basename(path) or f"image_{uuid.uuid4().hex}.png"
    with open(path, "rb") as file_obj:
        files = {"fileToUpload": (file_name, file_obj, mime_type)}
        data = {"reqtype": "fileupload", "time": "1h"}
        response = requests.post("https://litterbox.catbox.moe/resources/internals/api.php", files=files, data=data, timeout=60)
    if response.ok and response.text.strip().startswith("https://"):
        return response.text.strip()

    with open(path, "rb") as file_obj:
        files = {"fileToUpload": (file_name, file_obj, mime_type)}
        data = {"reqtype": "fileupload"}
        response = requests.post("https://catbox.moe/user/api.php", files=files, data=data, timeout=60)
    if response.ok and response.text.strip().startswith("https://"):
        return response.text.strip()
    raise RuntimeError("temporary image upload failed")


def normalize_image_ref(value):
    if not value:
        return None
    if isinstance(value, dict):
        if isinstance(value.get("url"), str):
            return normalize_image_ref(value["url"])
        if isinstance(value.get("image_url"), str):
            return normalize_image_ref(value["image_url"])
        if isinstance(value.get("image_url"), dict):
            return normalize_image_ref(value["image_url"].get("url"))
    if isinstance(value, str):
        if value.startswith("http://") or value.startswith("https://"):
            return value
        if value.startswith("data:image/"):
            path, mime_type = data_url_to_file(value)
            try:
                return upload_temp_image(path, mime_type)
            finally:
                try:
                    os.remove(path)
                except OSError:
                    pass
    return None


def first_image_from_payload(payload):
    candidates = []
    for key in ("reference_images", "image_urls", "images"):
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
        image_url = normalize_image_ref(value)
        if image_url:
            return image_url
    return None


def build_upstream_payload(payload, image_url=None):
    model = payload.get("model") or payload.get("model_name") or DEFAULT_MODEL
    prompt = payload.get("prompt") or ""
    upstream_payload = {
        "model": model,
        "prompt": prompt,
    }

    for key in ("size", "aspect_ratio", "n", "quality", "response_format"):
        if payload.get(key) is not None:
            upstream_payload[key] = payload[key]

    if image_url:
        existing_extra = payload.get("extra_body") if isinstance(payload.get("extra_body"), dict) else {}
        extra_body = dict(existing_extra)
        extra_body["image"] = image_url
        upstream_payload["extra_body"] = extra_body
        print(f"[agnes-image] image-to-image reference detected: {image_url[:96]}", flush=True)
    else:
        print("[agnes-image] text-to-image request", flush=True)

    return upstream_payload


def openai_image_response(upstream):
    data = upstream.get("data")
    if isinstance(data, list):
        result_data = []
        for item in data:
            if isinstance(item, dict):
                if item.get("url") or item.get("b64_json"):
                    result_data.append(item)
                elif item.get("image_url"):
                    result_data.append({"url": item["image_url"]})
                elif item.get("image"):
                    result_data.append({"url": item["image"]})
        if result_data:
            return {"created": upstream.get("created", now_seconds()), "data": result_data}

    for key in ("url", "image_url", "image"):
        if upstream.get(key):
            return {"created": now_seconds(), "data": [{"url": upstream[key]}]}

    for key in ("b64_json", "base64"):
        if upstream.get(key):
            return {"created": now_seconds(), "data": [{"b64_json": upstream[key]}]}

    images = upstream.get("images")
    if isinstance(images, list):
        result_data = []
        for item in images:
            if isinstance(item, str):
                if item.startswith("http"):
                    result_data.append({"url": item})
                else:
                    result_data.append({"b64_json": item})
            elif isinstance(item, dict):
                if item.get("url"):
                    result_data.append({"url": item["url"]})
                elif item.get("b64_json"):
                    result_data.append({"b64_json": item["b64_json"]})
        if result_data:
            return {"created": now_seconds(), "data": result_data}

    return upstream


def call_agnes(api_key, payload, image_url=None):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    upstream_payload = build_upstream_payload(payload, image_url=image_url)
    response = requests.post(
        f"{UPSTREAM_BASE_URL}/images/generations",
        headers=headers,
        json=upstream_payload,
        timeout=REQUEST_TIMEOUT,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Agnes upstream error {response.status_code}: {response.text[:1000]}")
    return openai_image_response(response.json())


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
        for item in fields:
            if item.filename:
                suffix = os.path.splitext(item.filename)[1] or ".png"
                fd, path = tempfile.mkstemp(prefix="agnes_upload_", suffix=suffix)
                with os.fdopen(fd, "wb") as file_obj:
                    file_obj.write(item.file.read())
                temp_files.append((path, item.type or "image/png"))
            else:
                payload[key] = item.value
    return payload, temp_files


class AgnesImageProxy(BaseHTTPRequestHandler):
    server_version = "AgnesImageSyncProxy/1.1"

    def log_message(self, fmt, *args):
        print(f"[agnes-image] {self.address_string()} - {fmt % args}", flush=True)

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/health", "/v1/health"):
            json_response(self, 200, {"status": "ok", "upstream": UPSTREAM_BASE_URL})
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

        auth = self.headers.get("Authorization") or ""
        api_key = auth.removeprefix("Bearer ").strip()
        if not api_key:
            error_response(self, 401, "missing api key")
            return

        temp_files = []
        try:
            content_type = self.headers.get("Content-Type", "")
            if content_type.startswith("multipart/form-data"):
                payload, temp_files = parse_multipart(self)
                image_url = None
                if temp_files:
                    image_url = upload_temp_image(temp_files[0][0], temp_files[0][1])
            else:
                payload = read_json_body(self)
                image_url = first_image_from_payload(payload)

            result = call_agnes(api_key, payload, image_url=image_url)
            json_response(self, 200, result)
        except Exception as error:
            print(f"[agnes-image] error: {error}", flush=True)
            error_response(self, 500, str(error))
        finally:
            for path_value, _mime_type in temp_files:
                try:
                    os.remove(path_value)
                except OSError:
                    pass


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8789)
    parser.add_argument("--no-kill-port", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    server = ThreadingHTTPServer((args.host, args.port), AgnesImageProxy)
    print(f"[agnes-image] listening on http://{args.host}:{args.port} -> {UPSTREAM_BASE_URL}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
