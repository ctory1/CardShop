# CardShop API

ASP.NET Core Web API for CardShop accounts and scanned cards.

## Setup

1. Install the .NET 8 SDK or newer. This machine currently has runtimes but no SDK.
2. In SSMS, open `api/sql/001-create-tables.sql` and run it against the `CardShop` database.
   If your tables already exist, run `api/sql/002-use-central-time-defaults.sql`, `api/sql/003-password-reset-tokens.sql`, and `api/sql/004-scanned-cards.sql` too.
   New `CreatedAt` values will be saved in Central Time using SQL Server's `Central Standard Time` zone, which handles daylight saving time.
3. From `api/`, configure the SQL Server connection string with user secrets:

```powershell
dotnet user-secrets init
dotnet user-secrets set "ConnectionStrings:CardShop" "Server=localhost;Database=CardShop;Trusted_Connection=True;TrustServerCertificate=True;"
```

4. Run the API:

```powershell
dotnet restore
dotnet run
```

5. Test:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

6. Point the frontend at the API by editing `docs/config.js`:

```js
window.CARDSHOP_API_BASE_URL = "https://your-api-host.example.com";
```

For local testing, use the URL shown by `dotnet run`, such as:

```js
window.CARDSHOP_API_BASE_URL = "https://localhost:5001";
```

When `CARDSHOP_API_BASE_URL` is blank, the frontend falls back to browser-only `localStorage`. When it is set, signup, login, and saved scanned cards go through this API and SQL Server.

## Security Notes

- Passwords are hashed on the server with ASP.NET Core `PasswordHasher`.
- The API returns an opaque bearer token for sessions.
- The bearer token is hashed before being stored in SQL Server.
- Do not put the SQL connection string in `docs/` or any browser JavaScript.
- Use environment variables, ASP.NET Core user secrets, or production hosting secrets for connection strings.
