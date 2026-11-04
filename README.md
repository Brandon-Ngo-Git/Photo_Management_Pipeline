# Brandon Ngo Studio

A responsive landscape and travel photography portfolio with Galleries, About, FAQ, and booking pages. The booking form checks open slots and saves reservations in MySQL.

## Run locally with Docker Compose

```powershell
docker compose up --build web
```

Open [http://localhost:3000](http://localhost:3000) for the website and
[http://localhost:5678](http://localhost:5678) for n8n. Starting `web` starts
every Compose service: MySQL and the API, n8n and its sandbox/certificate
services, task runners, and SearXNG.

## Uploaded photos and booking notifications

The photo dashboard is at [http://localhost:3000/admin](http://localhost:3000/admin).
Sign in with `PHOTO_ADMIN_USERNAME` and `PHOTO_ADMIN_PASSWORD` from the ignored root
`.env` file before uploading, for example:

```dotenv
PHOTO_ADMIN_USERNAME=studio-admin
PHOTO_ADMIN_PASSWORD=replace-with-a-unique-long-password
```

Replace the example password with a unique, strong value, then recreate the
API service with `docker compose up --build -d api web` to apply it. Use HTTPS
before exposing the admin page outside your trusted local network. JPEG, PNG,
and WebP files up to 20 MB are accepted. Image files persist in the Compose
`photo_uploads` volume; descriptions and image metadata are stored in MySQL.
Uploaded photos appear in the site's Recent Photographs section.
Each photo's ID is its uploaded filename, including the extension. Filenames
must be unique; a duplicate upload is rejected. Existing photos keep their
original IDs. Signing out clears the dashboard's in-memory credentials; reload
the page or sign out to end the dashboard session.

To send booking notifications through n8n, open [http://localhost:5678](http://localhost:5678)
and create a workflow with a **Webhook** node (`POST`, path `booking-created`)
connected to a **Send Email** node. In the email node, configure your SMTP
credential and notification address. The webhook payload is available at
`$json.body.booking`; for example, use `{{$json.body.booking.customer_name}}`
and `{{$json.body.booking.appointment_date}}` in the email body. Activate the
workflow, then submit a test booking. The API posts a `booking.created` event
after saving each booking in MySQL. Set `N8N_BOOKING_WEBHOOK_URL` in `.env`
only if you use a different webhook URL. A webhook failure does not undo a
saved booking; the booking confirmation reports if the event could not be
handed to n8n.

## Frontend structure

```text
frontend/
├── Dockerfile
├── index.html
├── package.json
├── config/
│   └── nginx.conf
├── src/
│   ├── App.jsx
│   ├── BookingPage.jsx
│   ├── PhotoAdminPage.jsx
│   └── main.jsx
├── vite.config.js
└── public/
    └── assets/
        └── css/styles.css
```

The frontend is a React single-page application built with Vite. To run it
outside Docker, install Node.js 20.19+ or 22.12+ and run:

```powershell
cd frontend
npm install
npm run dev
```

The Vite development server runs on [http://localhost:5173](http://localhost:5173)
and proxies `/api` requests to `http://localhost:8000`. Start the API on that
address if you want to test booking locally, or use the Docker Compose setup
above to run the complete application.

## Customize

- Replace the sample studio name, photographer bio, location, FAQ answers, and Unsplash images in `frontend\src\App.jsx` and `frontend\src\BookingPage.jsx`.
- Update the gallery categories and matching booking options in `frontend\src\App.jsx`, `frontend\src\BookingPage.jsx`, and `backend\app\routes\appointments.py`.
- Weekday appointment times are set in `backend\app\routes\appointments.py` (`BOOKING_TIMES`). Set `BUSINESS_TIMEZONE` in the environment to the studio's IANA timezone; it defaults to `America/Los_Angeles`.
- Reservations and uploaded-photo metadata are stored in the Compose `mysql_data` volume. Uploaded photo files are stored separately in `photo_uploads`.