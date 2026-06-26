#!/usr/bin/env python3
#
# CardShop
# Copyright © 2026 Colin Toryfter
# All Rights Reserved.
#
# Unauthorized copying or distribution of this file is prohibited.

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="Serve static files with browser caching disabled.")
    parser.add_argument("--directory", required=True)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    handler = partial(NoCacheHandler, directory=args.directory)
    server = ThreadingHTTPServer(("localhost", args.port), handler)
    print(f"Serving {args.directory} at http://localhost:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
