# Deploy the CardShop API to Azure (Free Tier)

This guide walks you through deploying the CardShop .NET API to Azure for free,
so your GitHub Pages site has a live backend for accounts and saved cards.

## Prerequisites

- An Azure account (free — sign up at https://azure.microsoft.com/free)
- The .NET 8 SDK installed locally
- Your CardShop code cloned to your machine

---

## Step 1: Create a Free Azure SQL Database

1. Go to https://portal.azure.com and sign in.

2. **Create a new resource** → search for **"Azure SQL"** → click **Create**.

3. Under **SQL Databases**, click **Create**.

4. Fill in the basics:
   - **Resource group:** Create new → `CardShop`
   - **Database name:** `CardShop`
   - **Server:** Click **Create new** server:
     - Server name: `cardshop-api` (must be globally unique)
     - Location: Pick the one closest to you (e.g., East US)
     - Authentication: Use **SQL authentication**
     - Server admin login: `cardshopadmin`
     - Password: Make a strong password (save this!)
   - **Want to use SQL elastic pool:** No
   - **Workload environment:** Development
   - **Compute + storage:** Click **Configure database**:
     - **Service tier:** Select **Basic (DTU)** — this is the free tier
     - Leave everything else default → **Apply**

5. Click **Next: Networking**:
   - **Connectivity method:** Public endpoint
   - **Firewall rules:** Check **"Allow Azure services and resources to access this server"**
   - Click **+ Add current client IP address** (so your local machine can connect for setup)

6. Click **Review + create** → **Create**.

Wait a few minutes for the database to deploy.

---

## Step 2: Run Your SQL Scripts

1. After deployment, go to your database in the Azure portal.

2. Click **Query editor (preview)** in the left menu.

3. Login with `cardshopadmin` and the password you set.

4. Copy-paste the entire contents of `api/sql/001-create-tables.sql` into the query editor.

5. Click **Run**. You should see "Commands completed successfully."

Your database is ready.

---

## Step 3: Get Your Database Connection String

1. In the Azure portal, go to your SQL database.

2. In the left menu, click **Connection strings**.

3. Copy the **ADO.NET (SQL authentication)** connection string. It looks like:
   ```
   Server=tcp:cardshop-api.database.windows.net,1433;Initial Catalog=CardShop;Persist Security Info=False;User ID=cardshopadmin;Password={your_password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
   ```

4. Replace `{your_password}` with the actual password.

Save this — you'll need it next.

---

## Step 4: Deploy the API to Azure App Service (Free Tier)

### 4a. Create the App Service

1. Go back to Azure portal → **Create a resource** → search for **"Web App"** → **Create**.

2. Fill in:
   - **Resource group:** Select `CardShop` (same as before)
   - **Name:** `cardshop-api` (must be globally unique, will be your URL)
   - **Publish:** Code
   - **Runtime stack:** .NET 8
   - **Operating System:** Windows
   - **Region:** Pick the one closest to you
   - **Windows Plan:** Click **Create new**:
     - Plan name: `CardShopPlan`
     - **Pricing plan:** Click **Change size** → **Dev/Test** tab → Select **F1 (Free)** → **Apply**
   - Leave everything else default.

3. Click **Review + create** → **Create**.

Wait a few minutes for the App Service to deploy.

### 4b. Set the Connection String

1. Go to your App Service in the Azure portal.

2. In the left menu, under **Settings**, click **Environment variables** → **Connection strings**:

   - **Name:** `CardShop`
   - **Value:** Paste the connection string from Step 3
   - **Type:** `SQLAzure`
   - Click **Apply**, then **Save** at the top.

### 4c. Add Your GitHub Pages URL to CORS

While still in **Environment variables**, under **App settings**, add:

   - **Name:** `Cors:AllowedOrigins:0`
   - **Value:** `http://localhost:8000`
   - Click **Apply**

Add another:

   - **Name:** `Cors:AllowedOrigins:1`
   - **Value:** `https://ctory1.github.io`
   - Click **Apply**

Then click **Save** at the top.

### 4d. Publish the API

From your local machine in the `api/` directory:

```bash
cd CardShop/api
dotnet publish -c Release -o ./publish
```

Now deploy via **Zip Deploy** using this PowerShell command:

```powershell
# Compress the publish folder
Compress-Archive -Path ./publish/* -DestinationPath ./publish.zip -Force

# Deploy using the Azure CLI (install if needed: winget install Microsoft.AzureCLI)
az webapp deploy --resource-group CardShop --name cardshop-api --src-path ./publish.zip --type zip
```

Or you can use **GitHub Actions** to auto-deploy (see Step 5 below for a workflow).

---

## Step 5: (Optional) Auto-Deploy the API via GitHub Actions

Create `.github/workflows/deploy-api.yml`:

```yaml
name: Deploy API to Azure

on:
  push:
    branches:
      - main
    paths:
      - 'api/**'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup .NET 8
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'

      - name: Build & Publish
        run: |
          cd api
          dotnet publish -c Release -o ./publish

      - name: Deploy to Azure
        uses: azure/webapps-deploy@v3
        with:
          app-name: cardshop-api
          slot-name: production
          package: api/publish
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
```

Then get your publish profile from Azure:
1. Go to your App Service → **Overview** → **Get publish profile** (download the file)
2. In your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
3. Create a new secret: `AZURE_WEBAPP_PUBLISH_PROFILE` with the file contents

---

## Step 6: Update the Frontend Config

Once your API is deployed, update `docs/config.js`:

```js
window.CARDSHOP_API_BASE_URL = "https://cardshop-api.azurewebsites.net";
```

Replace `cardshop-api` with whatever your App Service is named.

---

## Keeping Everything Free

| Service | Free Tier Limits |
|---------|-----------------|
| Azure SQL Database (Basic) | 2GB database, up to 2 concurrent connections |
| Azure App Service (F1) | 60 minutes CPU/day, 1GB RAM, 10 apps max |
| GitHub Pages | Unlimited static hosting |

**What to watch:** The F1 App Service will **go to sleep** after ~20 minutes of no traffic.
When a user visits after idle time, it takes 5-10 seconds to wake up (this is normal on free tier).
The static site (Pages) always serves instantly.

---

## Cost Summary

**$0 / month** as long as:
- Your database is ≤ 2GB
- Your daily CPU usage is under 60 minutes
- You don't exceed the free tier limits