# Black Horizon Studio

Black Horizon is a photography website meant to expand photographers reach. This site acts as a portfolio and client management system where the goal is to get people into your page. To get people on the page, each client is given a public page from their photo-shoot where it acts as your portfolio and a way to share your photos with others.

## Features

- Public photography portfolio with gallery, About, FAQ, and request pages.
- Session booking with availability checks and MySQL persistence.
- Private admin dashboard for managing bookings, public gallery photos, and form requests.
- Three request collage layouts: Mosaic, Classic grid, and Editorial.
- Shareable public collage pages at `/requests/{requestId}/collage`. These pages show only the request's photos, not its form submission details.
- n8n integration for booking notifications and form submissions.

## Run the application with Docker Compose

Docker Desktop and Docker Compose are required. From the project root:

```powershell
docker compose up --build web
```

Open:

- Website and admin dashboard: [http://localhost:3000](http://localhost:3000)
- n8n: [http://localhost:5678](http://localhost:5678)
- API health check: [http://localhost:8000/health](http://localhost:8000/health) (the API is not published to the host by default)

Starting the `web` service starts the Compose dependencies, including the API, MySQL, and n8n services.

```powershell
docker compose down
```

Database records and uploaded images are stored in the `mysql_data` and `photo_uploads` Compose volumes. `docker compose down -v` removes those volumes and permanently deletes their data.

## Admin dashboard

Open [http://localhost:3000/admin](http://localhost:3000/admin). Configure credentials in the ignored root `.env` file:

```dotenv
PHOTO_ADMIN_USERNAME=studio-admin
PHOTO_ADMIN_PASSWORD=replace-with-a-unique-long-password
```

Use unique, strong credentials. After changing them, recreate the services:

```powershell
docker compose up --build -d api web
```

The admin dashboard includes:

- **Bookings**: scheduled sessions.
- **Requests**: form submissions, per-request photo uploads, collage links, and a **Request fulfilled** action.
- **Archive**: requests marked fulfilled.
- **Photo library**, **Upload photo**, and **Analyze**: manage public gallery images and inspect their available EXIF metadata.

Admin API actions require HTTP Basic Authentication. Dashboard credentials are held in browser memory and cleared when signing out. Use HTTPS before making the admin page available outside a trusted local network.

## Request photos and public collages

In the admin dashboard, open **Bookings → Requests**. Each request has its own photo uploader with a 15-photo maximum. Request photos are separate from the public gallery and do not appear in the site's Recent Photographs section.

Use **Public collage** to open a shareable collage link. Anyone with that link can view the photos and select between the three layouts; the page does not display request details. Treat the link as public when sharing it. Photo uploads, deletion, and marking requests fulfilled remain admin-only.

Marking a request fulfilled moves it from **Requests** to **Archive**. The status is stored in MySQL and persists across refreshes.

## Booking notifications and n8n

To send booking notifications through n8n:

1. Open [http://localhost:5678](http://localhost:5678) and create a workflow with a **Webhook** node using `POST` and path `booking-created`.
2. Connect it to a **Send Email** node and configure SMTP credentials and the notification address.
3. Use the webhook payload at `$json.body.booking`, for example `{{$json.body.booking.customer_name}}` or `{{$json.body.booking.appointment_date}}`.
4. Activate the workflow and submit a test booking.

The API sends a `booking.created` event after saving a booking. Set `N8N_BOOKING_WEBHOOK_URL` in `.env` if the webhook URL differs from the Compose default. A webhook failure does not undo a saved booking; the booking confirmation reports if the event could not be handed to n8n.

## Send form submissions to the dashboard

In the form-triggered n8n workflow, add an **HTTP Request** node:

- Method: `POST`
- URL: `http://api:8000/api/requests`
- Body: the submission as a JSON object
- Authentication: HTTP Basic using `PHOTO_ADMIN_USERNAME` and `PHOTO_ADMIN_PASSWORD`

The dashboard lists the received fields and values in **Bookings → Requests**.

## Run the frontend outside Docker

Install Node.js 20.19+ or 22.12+, then:

```powershell
cd frontend
npm install
npm run dev
```

Vite runs at [http://localhost:5173](http://localhost:5173) and proxies `/api` requests to `http://localhost:8000`. Start the API and its MySQL database if you need working backend features.

Create a production frontend bundle with:

```powershell
cd frontend
npm run build
```

## Backend

The FastAPI application is in `backend/app`. Its dependencies are listed in `backend/requirements.txt`. The API creates or updates the required MySQL tables when it starts.

Key modules:

- `backend/app/main.py`: application setup and API route registration.
- `backend/app/database.py`: MySQL connections and schema initialization.
- `backend/app/routes/appointments.py`: booking, availability, and booking notifications.
- `backend/app/routes/photos.py`: public gallery and authenticated photo administration.
- `backend/app/routes/requests.py`: form submissions, per-request photo storage, public collages, and request fulfillment.

## Configuration and customization

- `.env`: n8n settings and optional admin credentials. Do not commit this file or put secrets in source control.
- `BUSINESS_TIMEZONE`: studio IANA timezone; defaults to `America/Los_Angeles`.
- `N8N_BOOKING_WEBHOOK_URL`: booking notification webhook.
- `PHOTO_ADMIN_USERNAME` and `PHOTO_ADMIN_PASSWORD`: admin dashboard credentials.
- `PHOTO_UPLOAD_DIR`: image storage path; defaults to `/data/uploads` in the API container.
- `backend/app/routes/appointments.py`: `BOOKING_TIMES` and supported session types.
- `frontend/src/App.jsx` and `frontend/src/BookingPage.jsx`: site content, galleries, and corresponding booking options.
- `frontend/public/assets/css/styles.css`: site and dashboard styling.
