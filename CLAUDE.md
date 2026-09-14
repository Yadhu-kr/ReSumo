# Project Rules for AI Agents

You are writing code for a production application. Follow these rules every turn.

<important if="writing any code">
## Secrets and Credentials
- Never hardcode API keys, tokens, passwords, or connection strings
- Use process.env.X (Node) or os.environ["X"] (Python). Nothing else
- Never log secrets, even in debug mode

## Authentication
- Use the managed auth provider in ARCHITECTURE.md (Clerk / Supabase Auth / Auth0)
- Never roll custom auth: no DIY JWT, no custom password hashing
- Auth checks run server-side. The client is untrusted

## Database
- Parameterized queries or ORM. Never string concatenation
- RLS is ON for every table with user data
- Sensitive fields (role, is_admin, subscription) live in a separate table

## Input Validation
- Validate every input server-side with Zod / Pydantic
- Reject by default, allow by explicit rule

## Dependencies (READ THIS BEFORE EVERY npm install)
- Verify the package exists on npm/PyPI before suggesting it
- If you're not 100% sure the package is real, say so. Do not guess
- Reject packages published less than 7 days ago unless I name them
- Reject packages with fewer than 1000 weekly downloads unless I name them

## Output Handling
- Never return stack traces or DB errors to clients in production
- Sanitize all user-generated content before rendering
- HTTPS only, HSTS enabled, CSP set
</important>

## When Uncertain
- Don't know if it's secure? STOP and ask
- About to skip a check to make it work? STOP and ask
- Never write "TODO: add auth later"