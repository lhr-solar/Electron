import os
import uvicorn

from server.app import asgi_app


def main():
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "4000"))
    uvicorn.run(asgi_app, host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
