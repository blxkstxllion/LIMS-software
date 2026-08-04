## Backend configuration

The API (`backend/src/GbcLims.Api`) requires a JWT signing secret — it refuses to start
without one, rather than falling back to a known default.

**Local development** (`dotnet run` from `backend/src/GbcLims.Api`): set it once via
user-secrets, which stores it outside the repo:

```
dotnet user-secrets set "Jwt:Secret" "<a long random value>"
```

In `Development`, the connection string is intentionally left blank in
`appsettings.Development.json`, so the API uses an in-memory database and seeds five
test accounts (`ADMIN` / `CHEMIST` / `ENGINEER` / `QA` / `MANAGER`, password
`Test1234`) — none of that seeding happens outside `Development`.

**Any other environment**: set `Jwt__Secret` and `ConnectionStrings__DefaultConnection`
as real environment variables. Never put real values in `appsettings.json` — it's
checked into source control with placeholder text on purpose. Also set
`Cors:AllowedOrigins` (an array) to your actual frontend origin(s); it defaults to the
local Vite dev ports otherwise.

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
