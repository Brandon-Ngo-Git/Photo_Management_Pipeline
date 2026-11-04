import React, { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import BookingPage from "./BookingPage.jsx";
import PhotoAdminPage from "./PhotoAdminPage.jsx";

// Metadata for each page
const pageMetadata = {
  "/": {
    title: "Image Material — Live for the moment",
    description:
      "Explore the galleries, meet the photographer, and plan a photography session with Brandon Ngo",
  },
  "/about": {
    title: "About — Brandon Ngo Photography",
    description:
      "Meet Brandon Ngo: Pacific Northwest landscape photographer, trail wanderer, and lover of quiet places.",
  },
  "/faq": {
    title: "Frequently asked questions — Brandon Ngo Photography",
    description:
      "Answers to common questions about planning and booking your photography session with Brandon Ngo Studio.",
  },
  "/book": {
    title: "Book a session — Brandon Ngo Photography",
    description:
      "Choose an open date and time to plan a landscape, wildlife, travel, or fine-art photography session with Brandon Ngo.",
  },
  "/admin": {
    title: "Studio dashboard — Brandon Ngo Photography",
    description: "Sign in to manage your private photo library.",
  },
};

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <Link
        className="wordmark"
        to="/"
        aria-label="Brandon Ngo Photography home"
        onClick={closeMenu}
      >
        Brandon Ngo <span>PHOTOGRAPHY</span>
      </Link>
      <button
        className="menu-toggle"
        type="button"
        aria-expanded={menuOpen}
        aria-controls="primary-navigation"
        onClick={() => setMenuOpen((open) => !open)}
      >
        Menu
      </button>
      <nav
        className={`navigation${menuOpen ? " navigation-open" : ""}`}
        id="primary-navigation"
        aria-label="Main navigation"
      >
        <NavLink className="nav-link" to="/" end onClick={closeMenu}>
          Galleries+
        </NavLink>
        <NavLink className="nav-link" to="/about" onClick={closeMenu}>
          About
        </NavLink>
        <NavLink className="nav-link" to="/faq" onClick={closeMenu}>
          FAQ
        </NavLink>
        <NavLink className="nav-link" to="/admin" onClick={closeMenu}>
          Upload
        </NavLink>
        <NavLink className="nav-link nav-book" to="/book" onClick={closeMenu}>
          Book a session <span aria-hidden="true">↗</span>
        </NavLink>
      </nav>
    </header>
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

function HomePage() {
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    const loadUploadedPhotos = async () => {
      try {
        const response = await fetch("/api/photos");
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            typeof result.detail === "string"
              ? result.detail
              : "Couldn't load uploaded photos.",
          );
        }
        setUploadedPhotos(result);
      } catch (error) {
        setPhotoError(
          error instanceof Error
            ? error.message
            : "Couldn't load uploaded photos.",
        );
      }
    };

    loadUploadedPhotos();
  }, []);

  const galleries = [
    {
      title: "Mountains",
      image:
        "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=85",
      alt: "Snow-covered alpine peaks in the morning light",
    },
    {
      title: "Wildlife",
      image:
        "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=900&q=85",
      alt: "Wild deer among the trees in a quiet forest",
    },
    {
      title: "Forests",
      image:
        "https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=900&q=85",
      alt: "Sunlight filtering through a green woodland",
    },
    {
      title: "Coast & water",
      image:
        "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=900&q=85",
      alt: "Blue waves rolling onto a quiet coastline",
    },
    {
      title: "Golden hour",
      image:
        "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=900&q=85",
      alt: "A glowing sunset over a misty mountain valley",
    },
    {
      title: "Farther afield",
      image:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85",
      alt: "A winding path through an expansive mountain landscape",
    },
  ];
  const journalEntries = [
    {
      image:
        "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=850&q=85",
      alt: "Sunrise light settling over a misty valley",
      eyebrow: "FIELD NOTES · 4 MIN READ",
      title: "The quiet hour before the trail wakes up",
    },
    {
      image:
        "https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=850&q=85",
      alt: "A shaded path winding through a tall forest",
      eyebrow: "ON THE TRAIL · 6 MIN READ",
      title: "A slower way through the woods",
    },
    {
      image:
        "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=850&q=85",
      alt: "A quiet stretch of ocean under a soft sky",
      eyebrow: "COASTAL DAYS · 3 MIN READ",
      title: "Letting the weather make the picture",
    },
  ];

  return (
    <>
      <main>
        <section className="hero portfolio-hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot"></span> PACIFIC NORTHWEST ·
              AVAILABLE TO TRAVEL
            </p>
            <h1>
              For the love of
              <br />
              <em>wide open places.</em>
            </h1>
            <p className="hero-intro">
              Quiet mornings, faraway trails, and the kind of light that makes
              you stop and look.
            </p>
            <a className="text-link" href="#galleries">
              Explore the galleries <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="hero-photo-wrap">
            <img
              className="hero-photo"
              src="https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=2200&q=90"
              alt="A still alpine lake reflecting forested mountains at sunrise"
            />
            <span className="photo-caption">
              Somewhere between here and the horizon.
            </span>
          </div>
        </section>

        <section className="portfolio-intro" aria-label="Photography approach">
          <p className="eyebrow">A COLLECTION OF PLACES & PERSPECTIVES</p>
          <h2>
            Out there is where I feel <em>most at home.</em>
          </h2>
          <p>
            From misty forest trails to the last light on the coast, these are a
            few corners of the world I keep coming back to.
          </p>
        </section>

        <section className="work-section section-pad" id="galleries">
          <div className="section-heading">
            <div>
              <p className="eyebrow">WANDER A LITTLE</p>
              <h2>
                Find your kind of <em>wild.</em>
              </h2>
            </div>
            <p>
              Little collections from places that remind us to slow down and
              look around.
            </p>
          </div>
          <div className="category-grid">
            {galleries.map((gallery, index) => (
              <Link className="category-card" to="/book" key={gallery.title}>
                <img src={gallery.image} alt={gallery.alt} loading="lazy" />
                <span className="category-number">
                  {String(index + 1).padStart(2, "0")} / 06
                </span>
                <span className="category-title">{gallery.title}</span>
                <span className="category-arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
            ))}
          </div>
        </section>

        {(uploadedPhotos.length > 0 || photoError) && (
          <section className="uploaded-gallery section-pad">
            <div className="section-heading">
              <div>
                <p className="eyebrow">RECENT PHOTOGRAPHS</p>
                <h2>
                  Moments from <em>the road.</em>
                </h2>
              </div>
            </div>
            {photoError ? (
              <p className="field-hint" role="status">
                {photoError}
              </p>
            ) : (
              <div className="uploaded-photo-grid">
                {uploadedPhotos.map((photo) => (
                  <figure className="uploaded-photo" key={photo.id}>
                    <img src={photo.image_url} alt={photo.alt_text} loading="lazy" />
                    <figcaption>{photo.alt_text}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="home-about section-pad">
          <div className="about-photo">
            <img
              src="https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1100&q=85"
              alt="An open mountain landscape glowing in warm evening light"
              loading="lazy"
            />
            <span className="about-photo-note">PACIFIC NORTHWEST, ALWAYS</span>
          </div>
          <div className="home-about-copy">
            <p className="eyebrow">A LITTLE ABOUT THE PHOTOGRAPHER</p>
            <h2>
              Chasing light, taking the <em>long way.</em>
            </h2>
            <p>
              I'm Brandon, a photographer drawn to quiet trails, changing
              weather, and the feeling of finding a place all your own. This is
              a collection of the landscapes and small details that make me
              stop along the way.
            </p>
            <Link className="button button-outline" to="/about">
              Get to know me <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>

        <section className="journal-section section-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NOTES FROM THE ROAD</p>
              <h2>
                A few days worth <em>remembering.</em>
              </h2>
            </div>
            <p>
              Small field notes from early starts, long drives, and staying out
              just a little later.
            </p>
          </div>
          <div className="journal-grid">
            {journalEntries.map((entry) => (
              <article className="journal-card" key={entry.title}>
                <img src={entry.image} alt={entry.alt} loading="lazy" />
                <p className="eyebrow">{entry.eyebrow}</p>
                <h3>{entry.title}</h3>
              </article>
            ))}
          </div>
        </section>

        <section className="booking-banner">
          <div>
            <p className="eyebrow">A PLACE YOU LOVE, A MOMENT TO KEEP</p>
            <h2>
              Let's plan a day
              <br />
              <em>out in the world.</em>
            </h2>
          </div>
          <Link className="button button-light" to="/book">
            Plan a photography session <span aria-hidden="true">↗</span>
          </Link>
          <span className="banner-scribble" aria-hidden="true">
            see you out there
          </span>
        </section>
      </main>
      <Footer
        links={
          <>
            <Link to="/faq">Questions?</Link>
            <Link to="/book">Let's make a plan ↗</Link>
            <Link to="/admin">Upload photos</Link>
          </>
        }
      />
    </>
  );
}

function AboutPage() {
  return (
    <>
      <main>
        <section className="page-hero about-hero">
          <div className="page-hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot"></span> THE PERSON BEHIND THE
              PHOTOGRAPHS
            </p>
            <h1>
              A person who
              <br />
              takes the <em>long way.</em>
            </h1>
            <p>
              Photographer, early riser, and the one who will always pull over
              for good light.
            </p>
          </div>
          <div className="page-hero-image">
            <img
              src="https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&q=85"
              alt="Mountain landscape in the Pacific Northwest at golden hour"
            />
            <span className="photo-caption">A favorite kind of detour.</span>
          </div>
        </section>

        <section className="story-section section-pad">
          <p className="eyebrow">SO GLAD YOU'RE HERE</p>
          <div className="story-copy">
            <h2>
              The best pictures begin with <em>paying attention.</em>
            </h2>
            <p>
              Hi, I'm Brandon. I'm a Pacific Northwest photographer drawn to
              quiet trails, changing skies, and the small details that make a
              place feel like nowhere else.
            </p>
            <p>
              My camera has taken me through rain-soaked forests, along salt-air
              coastlines, and up more mountain roads than I can count. I make
              photographs slowly: waiting for the light, taking the side trail,
              and giving a place enough time to surprise me.
            </p>
            <p>
              When I'm not behind the camera, you'll find me with a map open, a
              thermos in my bag, and an unreasonable amount of time set aside
              for the scenic route.
            </p>
            <Link className="button button-dark" to="/book">
              Plan a photography session <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>

        <section className="values-section">
          <p className="eyebrow">THE WAY I SEE IT</p>
          <div className="values-grid">
            <article>
              <span>01</span>
              <h3>Leave room to wander.</h3>
              <p>The best view isn't always the one we set out to find.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Let the weather in.</h3>
              <p>Mist, rain, and first light all have a way of making a place its own.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Look a little closer.</h3>
              <p>There's always something worth noticing along the way.</p>
            </article>
          </div>
        </section>
      </main>
      <Footer
        links={
          <>
            <Link to="/faq">Questions?</Link>
            <Link to="/book">Let's make a plan ↗</Link>
          </>
        }
      />
    </>
  );
}

const faqEntries = [
  {
    question: "What should I expect when we work together?",
    answer:
      "After you choose a date, I'll get in touch to talk through your ideas, location, and what you'd like to photograph. We'll make a plan that leaves room for the weather and the good light.",
  },
  {
    question: "What if I've never had professional photos taken?",
    answer:
      "Absolutely. We can plan a relaxed session at a favorite place, a quiet trail, or somewhere new. I'll help with the details so you can enjoy the day.",
  },
  {
    question: "What kind of sessions can I book?",
    answer:
      "Choose landscapes, wildlife, travel, or a fine-art print consultation when you book. If your idea doesn't fit neatly into one of those, tell me a little about it in the notes and we'll figure it out together.",
  },
  {
    question: "Where do sessions take place?",
    answer:
      "I'm based in the Pacific Northwest and available to travel. Available times are shown in the studio's local time, and we'll talk locations when we plan your session.",
  },
  {
    question: "What if the weather doesn't cooperate?",
    answer:
      "Changing weather is part of being outdoors. We'll keep an eye on the forecast and make a plan that feels right, whether that means a nearby alternative or another date.",
  },
  {
    question: "How do I save a date?",
    answer:
      "Use the booking page to choose an open weekday and time for a photography session or print consultation. Once your request is saved, I'll be in touch to confirm the details.",
  },
];

function FaqPage() {
  return (
    <>
      <main>
        <section className="simple-page-hero">
          <p className="eyebrow">
            <span className="eyebrow-dot"></span> THE LITTLE DETAILS
          </p>
          <h1>
            Good questions,
            <br />
            <em>good answers.</em>
          </h1>
          <p>A few things you might be wondering before we make a plan together.</p>
        </section>

        <section className="faq-section">
          <div className="faq-list">
            {faqEntries.map((entry) => (
              <details key={entry.question}>
                <summary>
                  {entry.question}
                  <span aria-hidden="true"></span>
                </summary>
                <p>{entry.answer}</p>
              </details>
            ))}
          </div>
          <aside className="faq-aside">
            <span className="faq-aside-icon" aria-hidden="true">
              ✳
            </span>
            <h2>Still curious?</h2>
            <p>
              Every story is a little different. Tell me what you have in mind
              and we'll take it from there.
            </p>
            <Link className="text-link" to="/book">
              Let's talk about it <span aria-hidden="true">↗</span>
            </Link>
          </aside>
        </section>
      </main>
      <Footer
        links={
          <>
            <Link to="/about">Meet Brandon</Link>
            <Link to="/book">Let's make a plan ↗</Link>
          </>
        }
      />
    </>
  );
}

function NotFoundPage() {
  return (
    <>
      <main>
        <section className="simple-page-hero">
          <p className="eyebrow">PAGE NOT FOUND</p>
          <h1>
            Let's find our
            <br />
            <em>way back.</em>
          </h1>
          <Link className="button button-dark" to="/">
            Return to the galleries
          </Link>
        </section>
      </main>
      <Footer links={<Link to="/book">Book a session</Link>} />
    </>
  );
}


export default function App() {
  const location = useLocation();

  useEffect(() => {
    // Checks to see if theres a valid path like "./about" if not it will deafult to 404
    const metadata = pageMetadata[location.pathname] ?? {
      title: "Page not found — Brandon Ngo Photography",
      description: "The page you requested could not be found.",
    };
    document.title = metadata.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", metadata.description);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Returnsthe headers and roots for the pages including the 404 error
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/book" element={<BookingPage />} />
        <Route path="/admin" element={<PhotoAdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
