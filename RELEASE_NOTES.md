# Release Notes

## v1.0.1

- Fixed Agnes video submission path handling so UpdreamGlobal requests no longer fail with local 404.
- Fixed Agnes video payload `seconds` type for Agnes upstream compatibility.
- Added `ref_images` support for Agnes image-to-video/reference-to-video requests.
- Improved Agnes video completion response shape for Updream video result parsing.
- Fixed stale temporary Updream path fallback in the manager.

## v1.0.0

- Initial desktop manager build.
- Added local service management and Updream config writing.
- Added APIMart, RunningHub, Agnes image, Agnes video, and Jimeng CLI entries.
