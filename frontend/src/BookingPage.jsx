import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function responseErrorDetail(detail) {
  if (Array.isArray(detail)) {
    return detail.map((issue) => issue.msg).join(" ");
  }
  return detail;
}

export default function BookingPage() {
  const [appointmentDate, setAppointmentDate] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedTime, setSelectedTime] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState(
    "Choose a date to see available times.",
  );
  const [formStatus, setFormStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!appointmentDate) {
      setAvailableSlots([]);
      setAvailabilityMessage("Choose a date to see available times.");
      return undefined;
    }

    const controller = new AbortController();
    const loadAvailability = async () => {
      setSelectedTime("");
      setAvailableSlots([]);
      setAvailabilityMessage("Checking open times...");

      try {
        const query = new URLSearchParams({ date: appointmentDate });
        const response = await fetch(
          `/api/appointments/availability?${query}`,
          { signal: controller.signal },
        );
        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.detail || "Couldn't check availability. Please try again.",
          );
        }

        setAvailableSlots(result.available_slots);
        setAvailabilityMessage(
          result.available_slots.length === 0
            ? "No open times on that date. Try another weekday."
            : "All times are in the studio's local time.",
        );
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }
        setAvailabilityMessage(
          error instanceof Error
            ? error.message
            : "Couldn't check availability. Please try again.",
        );
      }
    };

    loadAvailability();
    return () => controller.abort();
  }, [appointmentDate]);

  const handleDateChange = (event) => {
    setFormStatus("");
    setSelectedTime("");
    setAppointmentDate(event.target.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormStatus("");

    if (!selectedTime) {
      setFormStatus("Please choose an available time.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const appointment = Object.fromEntries(formData.entries());
    setSubmitting(true);

    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appointment),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          responseErrorDetail(result.detail) ||
            "Couldn't save your session. Please try again.",
        );
      }

      setFormStatus(
        result.notification_status === "sent"
          ? "Your request is saved and sent to the studio for follow-up."
          : "Your request is saved, but the studio notification could not be sent. Please contact the studio directly.",
      );
      form.reset();
      setSelectedTime("");
      setAppointmentDate("");
    } catch (error) {
      setFormStatus(
        error instanceof Error
          ? error.message
          : "Couldn't save your session. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <main>
        <section className="simple-page-hero booking-hero">
          <p className="eyebrow">
            <span className="eyebrow-dot"></span> YOUR STORY STARTS HERE
          </p>
          <h1>
            Let's find a day
            <br />
            that feels <em>like yours.</em>
          </h1>
          <p>
            Pick an open time, tell me what you're dreaming up, and I'll be in
            touch to plan the details.
          </p>
        </section>

        <section className="booking-layout">
          <aside className="booking-aside">
            <p className="eyebrow">A FEW NOTES</p>
            <h2>Easy does it.</h2>
            <p>
              Your date and time are saved as soon as you send the form. I'll
              follow up personally to talk through the location and details.
            </p>
            <div className="booking-aside-divider"></div>
            <p className="eyebrow">THE SESSION MENU</p>
            <ul className="session-list">
              <li>
                Landscapes <span>01</span>
              </li>
              <li>
                Wildlife <span>02</span>
              </li>
              <li>
                Travel <span>03</span>
              </li>
              <li>
                Fine-art prints <span>04</span>
              </li>
            </ul>
            <p className="booking-aside-footnote">
              Weekday appointments · Studio local time
            </p>
          </aside>

          <form className="booking-form" onSubmit={handleSubmit}>
            <p className="form-step">
              01 <span>YOUR SESSION</span>
            </p>
            <label className="field-label" htmlFor="session-type">
              What would you like to photograph?
            </label>
            <select id="session-type" name="session_type" required>
              <option value="" disabled>
                Choose an area of interest
              </option>
              <option value="Landscape">Landscapes</option>
              <option value="Wildlife">Wildlife</option>
              <option value="Travel">Travel</option>
              <option value="Fine Art">Fine-art prints</option>
            </select>

            <div className="form-row date-row">
              <div className="form-field">
                <label className="field-label" htmlFor="appointment-date">
                  Choose a weekday
                </label>
                <input
                  id="appointment-date"
                  name="appointment_date"
                  type="date"
                  min={localDate(new Date())}
                  value={appointmentDate}
                  onChange={handleDateChange}
                  required
                />
              </div>
            </div>
            <fieldset className="time-fieldset">
              <legend className="field-label">Choose an open time</legend>
              <p className="field-hint" id="availability-message">
                {availabilityMessage}
              </p>
              <div
                className="time-slots"
                aria-describedby="availability-message"
              >
                {availableSlots.map((time) => (
                  <button
                    className="time-slot"
                    type="button"
                    key={time}
                    aria-pressed={selectedTime === time}
                    onClick={() => setSelectedTime(time)}
                  >
                    {new Date(`2000-01-01T${time}`).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </button>
                ))}
              </div>
              <input
                id="appointment-time"
                name="appointment_time"
                type="hidden"
                value={selectedTime}
                readOnly
              />
            </fieldset>

            <p className="form-step form-step-contact">
              02 <span>A LITTLE ABOUT YOU</span>
            </p>
            <div className="form-row">
              <div className="form-field">
                <label className="field-label" htmlFor="customer-name">
                  Your name
                </label>
                <input
                  id="customer-name"
                  name="customer_name"
                  type="text"
                  autoComplete="name"
                  maxLength="100"
                  placeholder="First and last"
                  required
                />
              </div>
              <div className="form-field">
                <label className="field-label" htmlFor="customer-email">
                  Email address
                </label>
                <input
                  id="customer-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength="254"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="customer-phone">
                Phone <span className="optional">(optional)</span>
              </label>
              <input
                id="customer-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength="30"
                placeholder="A number I can reach you at"
              />
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="session-notes">
                Anything else you'd like me to know?{" "}
                <span className="optional">(optional)</span>
              </label>
              <textarea
                id="session-notes"
                name="notes"
                rows="3"
                maxLength="1000"
                placeholder="A little about the people, the plan, or what you're dreaming up..."
              ></textarea>
            </div>

            <p className="form-status" role="status" aria-live="polite">
              {formStatus}
            </p>
            <button
              className="button button-dark submit-button"
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                "Saving your session..."
              ) : (
                <>
                  Save my session <span aria-hidden="true">↗</span>
                </>
              )}
            </button>
            <p className="form-privacy">
              Your details are only used to plan your photography session.
            </p>
          </form>
        </section>
      </main>
      <Footer
        links={
          <>
            <Link to="/faq">Questions?</Link>
            <Link to="/about">Meet Brandon</Link>
          </>
        }
      />
    </>
  );
}

function Footer({ links }) {
  return (
    <footer className="site-footer">
      <Link className="wordmark" to="/">
        Brandon Ngo <span>PHOTOGRAPHY</span>
      </Link>
      <p>
        Photographs from wild places.{" "}
        <span>Pacific Northwest · Available to travel</span>
      </p>
      <div className="footer-links">{links}</div>
      <small>© {new Date().getFullYear()} Brandon Ngo Studio</small>
    </footer>
  );
}
