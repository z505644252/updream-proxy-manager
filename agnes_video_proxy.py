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
DEFAULT_MODEL = os.environ.get("AGNES_VIDEO_MODEL", "agnes-video-v2.0")
REQUEST_TIMEOUT = int(os.environ.get("AGNES_REQUEST_TIMEOUT", "180"))


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
    fd, path = tempfile.mkstemp(prefix="agnes_video_ref_", suffix=suffix)
    with os.fdopen(fd, "wb") as file_obj:
        file_obj.write(data)
    return path, mime_type


def upload_temp_image(path, mime_type=None):
    mime_type = mime_type or mimetypes.guess_type(path)[0] or "image/png"
    file_name = os.path.basename(path) or f"image_{uuid.uuid4().hex}.png"
    with open(path, "rb") as file_obj:
        files = {"fileToUpload": (file_name, file_obj, mime_type)}
        data = {"reqtype": "fileupload", "time": "1h"}
        response = requests.post(
            "https://litterbox.catbox.moe/resources/internals/api.php",
            files=files,
            data=data,
            timeout=60,
        )
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
        for key in ("url", "image", "image_url", "reference_image"):
            nested = value.get(key)
            if isinstance(nested, dict):
                nested = nested.get("url")
            image_url = normalize_image_ref(nested)
            if image_url:
                return image_url
    if isinstance(value, str):
        if value.startswith(("http://", "https://")):
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
    for key in (
        "image",
        "image_url",
        "input_image",
        "first_frame_image",
        "reference_image",
        "reference_images",
        "ref_image",
        "ref_images",
        "image_urls",
        "images",
    ):
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


def first_present(payload, *keys):
    for key in keys:
        value = payload.get(key)
        if value not in (None, ""):
            return value
    return None


def size_from_options(payload):
    size = first_present(payload, "size", "resolution_size")
    if size:
        return str(size).replace("*", "x")

    resolution = str(first_present(payload, "resolution", "quality") or "720p").lower()
    ratio = str(first_present(payload, "ratio", "aspect_ratio", "aspectRatio") or "16:9")
    height = 720
    match = re.search(r"(\d+)", resolution)
    if match:
        height = int(match.group(1))

    ratios = {
        "16:9": (16, 9),
        "9:16": (9, 16),
        "1:1": (1, 1),
        "4:3": (4, 3),
        "3:4": (3, 4),
    }
    width_ratio, height_ratio = ratios.get(ratio, (16, 9))
    width = int(round(height * width_ratio / height_ratio))
    width = max(64, (width // 64) * 64)
    height = max(64, (height // 64) * 64)
    return f"{width}x{height}"


def build_upstream_payload(payload, image_url=None):
    model = first_present(payload, "model", "model_name", "endpoint_id") or DEFAULT_MODEL
    upstream_payload = {
        "model": model,
        "prompt": first_present(payload, "prompt", "text", "description") or "",
    }

    duration = first_present(payload, "duration", "seconds")
    if duration is not None:
        duration_text = str(duration)
        duration_match = re.search(r"[\d.]+", duration_text)
        upstream_payload["seconds"] = duration_match.group(0) if duration_match else duration_text

    upstream_payload["size"] = size_from_options(payload)

    for key in ("seed", "fps", "n"):
        value = first_present(payload, key)
        if value is not None:
            upstream_payload[key] = value

    if image_url:
        extra_body = dict(payload.get("extra_body") or {})
        extra_body["image"] = image_url
        upstream_payload["extra_body"] = extra_body
        print(f"[agnes-video] image-to-video reference detected: {image_url[:96]}", flush=True)
    else:
        print("[agnes-video] text-to-video request", flush=True)

    return upstream_payload


def headers(api_key):
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def extract_task_id(upstream):
    for key in ("task_id", "id"):
        if upstream.get(key):
            return upstream[key]
    data = upstream.get("data")
    if isinstance(data, dict):
        for key in ("task_id", "id"):
            if data.get(key):
                return data[key]
    raise RuntimeError(f"Agnes video task id not found: {json.dumps(upstream, ensure_ascii=False)[:1000]}")


def extract_status(upstream):
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


def walk_video_urls(value, found=None):
    if found is None:
        found = []
    if isinstance(value, str):
        if value.startswith(("http://", "https://")) and (".mp4" in value.lower() or ".mov" in value.lower() or ".webm" in value.lower()):
            found.append(value)
    elif isinstance(value, list):
        for item in value:
            walk_video_urls(item, found)
    elif isinstance(value, dict):
        for item in value.values():
            walk_video_urls(item, found)
    return found


def first_video_url(upstream):
    for key in ("video_url", "url", "output", "result", "remixed_from_video_id"):
        value = upstream.get(key)
        if isinstance(value, str) and value.startswith(("http://", "https://")):
            return value
    for key in ("videos", "video_urls", "outputs", "result_urls"):
        value = upstream.get(key)
        urls = walk_video_urls(value)
        if urls:
            return urls[0]
    data = upstream.get("data")
    if isinstance(data, dict):
        direct = first_video_url(data)
        if direct:
            return direct
    urls = walk_video_urls(upstream)
    return urls[0] if urls else None


def compatible_completed_result(task_id, upstream):
    video_url = first_video_url(upstream)
    if not video_url:
        return None

    video_item = {"url": video_url, "video_url": video_url}
    result_obj = {
        "url": video_url,
        "video_url": video_url,
        "videos": [video_item],
        "video_urls": [video_url],
    }
    data = dict(upstream.get("data") or {}) if isinstance(upstream.get("data"), dict) else {}
    data.update(
        {
            "id": task_id,
            "task_id": task_id,
            "status": "completed",
            "progress": 100,
            "video_url": video_url,
            "url": video_url,
            "videos": [video_item],
            "video_urls": [video_url],
            "result": result_obj,
            "result_url": video_url,
            "result_urls": [video_url],
            "output": result_obj,
            "outputs": [video_item],
        }
    )

    return {
        "task_id": task_id,
        "id": task_id,
        "object": "video",
        "model": upstream.get("model") or data.get("model") or DEFAULT_MODEL,
        "status": "completed",
        "progress": 100,
        "video_url": video_url,
        "url": video_url,
        "videos": [video_item],
        "video_urls": [video_url],
        "result": result_obj,
        "result_url": video_url,
        "result_urls": [video_url],
        "output": result_obj,
        "outputs": [video_item],
        "data": data,
        "raw": upstream,
    }


def submit_agnes(api_key, payload, image_url=None):
    response = requests.post(
        f"{UPSTREAM_BASE_URL}/videos",
        headers=headers(api_key),
        json=build_upstream_payload(payload, image_url=image_url),
        timeout=REQUEST_TIMEOUT,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Agnes upstream error {response.status_code}: {response.text[:1000]}")
    upstream = response.json()
    task_id = extract_task_id(upstream)
    return {
        "task_id": task_id,
        "id": task_id,
        "status": extract_status(upstream),
        "progress": upstream.get("progress", 0),
        "data": {"task_id": task_id, "id": task_id, "status": extract_status(upstream), "raw": upstream},
    }


def poll_agnes(api_key, task_id):
    response = requests.get(
        f"{UPSTREAM_BASE_URL}/videos/{task_id}",
        headers=headers(api_key),
        timeout=REQUEST_TIMEOUT,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Agnes upstream error {response.status_code}: {response.text[:1000]}")
    upstream = response.json()
    status = extract_status(upstream)
    if status == "completed":
        completed = compatible_completed_result(task_id, upstream)
        if completed:
            print(f"[agnes-video] completed: {completed['video_url'][:120]}", flush=True)
            return completed

    return {
        "task_id": task_id,
        "id": task_id,
        "object": "video",
        "model": upstream.get("model") or DEFAULT_MODEL,
        "status": status,
        "progress": upstream.get("progress") or (upstream.get("data") or {}).get("progress") if isinstance(upstream.get("data"), dict) else 0,
        "data": upstream.get("data") if isinstance(upstream.get("data"), dict) else {"raw": upstream},
        "raw": upstream,
    }


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
                fd, path = tempfile.mkstemp(prefix="agnes_video_upload_", suffix=suffix)
                with os.fdopen(fd, "wb") as file_obj:
                    file_obj.write(item.file.read())
                temp_files.append((path, item.type or "image/png"))
            else:
                payload[key] = item.value
    return payload, temp_files


class AgnesVideoProxy(BaseHTTPRequestHandler):
    server_version = "AgnesVideoProxy/1.1"

    def log_message(self, fmt, *args):
        print(f"[agnes-video] {self.address_string()} - {fmt % args}", flush=True)

    def api_key(self):
        auth = self.headers.get("Authorization") or self.headers.get("X-API-Key") or ""
        return auth.removeprefix("Bearer ").strip()

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/")
        if path in ("", "/health", "/v1/health"):
            json_response(self, 200, {"status": "ok", "upstream": UPSTREAM_BASE_URL})
            return
        if path in ("/models", "/v1/models"):
            json_response(self, 200, {"object": "list", "data": [{"id": DEFAULT_MODEL, "object": "model"}]})
            return

        task_id = None
        for prefix in ("/task/", "/api/v1/task/", "/api/v1/tasks/", "/v1/videos/"):
            if path.startswith(prefix):
                task_id = path[len(prefix) :]
                break
        if not task_id:
            error_response(self, 404, "not found")
            return

        api_key = self.api_key()
        if not api_key:
            error_response(self, 401, "missing api key")
            return
        try:
            json_response(self, 200, poll_agnes(api_key, task_id))
        except Exception as error:
            print(f"[agnes-video] poll error: {error}", flush=True)
            error_response(self, 500, str(error))

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/")
        print(f"[agnes-video] submit path: {path or '/'}", flush=True)

        api_key = self.api_key()
        if not api_key:
            error_response(self, 401, "missing api key")
            return

        temp_files = []
        try:
            content_type = self.headers.get("Content-Type", "")
            if content_type.startswith("multipart/form-data"):
                payload, temp_files = parse_multipart(self)
                image_url = upload_temp_image(temp_files[0][0], temp_files[0][1]) if temp_files else first_image_from_payload(payload)
            else:
                payload = read_json_body(self)
                image_url = first_image_from_payload(payload)
            result = submit_agnes(api_key, payload, image_url=image_url)
            json_response(self, 200, result)
        except Exception as error:
            print(f"[agnes-video] submit error: {error}", flush=True)
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
    parser.add_argument("--port", type=int, default=8790)
    parser.add_argument("--no-kill-port", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    server = ThreadingHTTPServer((args.host, args.port), AgnesVideoProxy)
    print(f"[agnes-video] listening on http://{args.host}:{args.port} -> {UPSTREAM_BASE_URL}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
