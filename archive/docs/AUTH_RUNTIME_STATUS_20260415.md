# Authentication Runtime Status

- Full application server is running on port 3000 and exposed publicly.
- Authentication API login verification succeeds for `demo@farmer.com` with password `demo123`.
- Authentication profile verification also succeeds using the returned bearer token.
- The root full-stack URL currently renders a blank page in browser verification, despite the app title loading successfully.
- The earlier preview-only URL on port 4174 was not backed by the live authentication API, which explains the original sign-in failure.
