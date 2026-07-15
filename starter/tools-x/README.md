# @intx/tools-x

Interchange tool package for the X API. The first implementation phase adds
the Users operations while keeping the HTTP client reusable for later tool
categories.

The package calls the X API directly. It does not shell out to `xurl` and does
not forward requests to an MCP server.
