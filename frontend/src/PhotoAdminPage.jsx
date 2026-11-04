import React, { useEffect, useMemo, useState } from "react";

function responseMessage(result, fallback) {
  return typeof result.detail === "string" ? result.detail : fallback;
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PhotoAdminPage() {
  const [images, setImages] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authorization, setAuthorization] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [uploading, setUploading] = useState(false);

  const totalStorage = useMemo(
    () => images.reduce((total, image) => total + image.file_size, 0),
    [images],
  );

  useEffect(() => {
    if (!authorization) {
      return;
    }

    const loadImages = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/photos", {
          headers: { Authorization: authorization },
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            responseMessage(result, "Couldn't load the photo library."),
          );
        }
        setImages(result);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Couldn't load the photo library.",
        );
      } finally {
        setLoading(false);
      }
    };

    loadImages();
  }, [authorization]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setLoggingIn(true);

    try {
      const credentials = window.btoa(`${username}:${password}`);
      const response = await fetch("/api/photos/session", {
        method: "POST",
        headers: { Authorization: `Basic ${credentials}` },
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          responseMessage(result, "Couldn't sign in to the photo dashboard."),
        );
      }
      setAuthorization(`Basic ${credentials}`);
      setPassword("");
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Couldn't sign in to the photo dashboard.",
      );
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setAuthorization("");
    setUsername("");
    setPassword("");
    setImages([]);
    setError("");
    setStatus("");
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    if (!formData.get("image")?.size) {
      setError("Choose a photo to upload.");
      return;
    }

    setUploading(true);
    try {
      const response = await fetch("/api/photos", {
        method: "POST",
        headers: { Authorization: authorization },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(responseMessage(result, "Couldn't upload this photo."));
      }

      setImages((currentImages) => [result, ...currentImages]);
      setStatus("Photo uploaded and added to the public gallery.");
      form.reset();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Couldn't upload this photo.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (image) => {
    setError("");
    setStatus("");
    try {
      const response = await fetch(
        `/api/photos/${encodeURIComponent(image.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: authorization },
        },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(responseMessage(result, "Couldn't delete this photo."));
      }

      setImages((currentImages) =>
        currentImages.filter((currentImage) => currentImage.id !== image.id),
      );
      setStatus("Photo removed from the gallery.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Couldn't delete this photo.",
      );
    }
  };

  if (!authorization) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-card" aria-labelledby="admin-login-title">
          <p className="eyebrow">PRIVATE STUDIO</p>
          <h1 id="admin-login-title">
            Welcome
            <br />
            <em>back.</em>
          </h1>
          <p className="admin-login-intro">
            Sign in to manage your photography library.
          </p>
          <form className="booking-form admin-login-form" onSubmit={handleLogin}>
            <div className="form-field">
              <label className="field-label" htmlFor="admin-username">
                Username
              </label>
              <input
                id="admin-username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="admin-password">
                Password
              </label>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error && (
              <p className="form-status admin-login-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button button-dark submit-button"
              type="submit"
              disabled={loggingIn}
            >
              {loggingIn ? "Signing in..." : "Sign in"}
            </button>
            <p className="form-privacy">
              Dashboard access uses the admin credentials configured for this
              project.
            </p>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="photo-dashboard">
      <section className="dashboard-heading">
        <div>
          <p className="eyebrow">PRIVATE STUDIO · PHOTO MANAGEMENT</p>
          <h1>
            Studio
            <br />
            <em>dashboard.</em>
          </h1>
          <p className="dashboard-intro">
            Your uploaded photographs, all in one place.
          </p>
        </div>
        <button
          className="button button-outline dashboard-logout"
          type="button"
          onClick={handleLogout}
        >
          Sign out
        </button>
      </section>

      <section className="dashboard-stats" aria-label="Photo library summary">
        <article className="dashboard-stat">
          <span className="dashboard-stat-label">PHOTOS IN LIBRARY</span>
          <strong>{images.length}</strong>
          <span>Uploaded photographs</span>
        </article>
        <article className="dashboard-stat">
          <span className="dashboard-stat-label">LIBRARY SIZE</span>
          <strong>{formatFileSize(totalStorage)}</strong>
          <span>Stored image files</span>
        </article>
        <article className="dashboard-stat">
          <span className="dashboard-stat-label">LATEST UPLOAD</span>
          <strong>{images.length ? formatDate(images[0].created_at) : "—"}</strong>
          <span>{images.length ? images[0].id : "No photos uploaded yet"}</span>
        </article>
      </section>

      <div className="dashboard-content">
        <section className="dashboard-panel dashboard-upload-panel">
          <div className="dashboard-panel-heading">
            <p className="eyebrow">ADD TO THE COLLECTION</p>
            <h2>Upload a photo</h2>
            <p>JPEG, PNG, or WebP · up to 20 MB</p>
          </div>
          <form className="booking-form photo-upload-form" onSubmit={handleUpload}>
            <div className="form-field">
              <label className="field-label" htmlFor="photo-file">
                Choose a photo
              </label>
              <input
                id="photo-file"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="photo-alt-text">
                Photo description
              </label>
              <input
                id="photo-alt-text"
                name="alt_text"
                type="text"
                maxLength="200"
                placeholder="Describe the photo for visitors"
                required
              />
            </div>
            {(error || status) && (
              <p
                className="form-status"
                role={error ? "alert" : "status"}
                aria-live="polite"
              >
                {error || status}
              </p>
            )}
            <button
              className="button button-dark submit-button"
              type="submit"
              disabled={uploading}
            >
              {uploading ? "Uploading photo..." : "Upload photo"}
            </button>
          </form>
        </section>

        <section className="dashboard-panel dashboard-library" aria-labelledby="photo-library-title">
          <div className="dashboard-library-heading">
            <div>
              <p className="eyebrow">YOUR COLLECTION</p>
              <h2 id="photo-library-title">Photo library</h2>
            </div>
            <span className="dashboard-count">
              {images.length} {images.length === 1 ? "photo" : "photos"}
            </span>
          </div>
          {loading && <p className="field-hint">Loading photos...</p>}
          {!loading && images.length === 0 && (
            <p className="dashboard-empty">
              Your library is ready. Upload a photo to get started.
            </p>
          )}
          {images.length > 0 && (
            <div className="uploaded-photo-grid">
              {images.map((image) => (
                <figure className="uploaded-photo dashboard-photo" key={image.id}>
                  <img src={image.image_url} alt={image.alt_text} loading="lazy" />
                  <figcaption>
                    <strong>{image.alt_text}</strong>
                    <span>{image.id}</span>
                    <span>
                      {formatFileSize(image.file_size)} · {formatDate(image.created_at)}
                    </span>
                  </figcaption>
                  <button
                    className="button button-outline photo-delete-button"
                    type="button"
                    onClick={() => handleDelete(image)}
                  >
                    Remove photo
                  </button>
                </figure>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
