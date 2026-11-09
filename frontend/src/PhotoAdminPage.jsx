import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

function responseMessage(result, fallback) {
  return typeof result.detail === "string" ? result.detail : fallback;
}

// Keep file sizes readable in the overview and photo library.
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

function appointmentDateTime(appointment) {
  return new Date(
    `${appointment.appointment_date}T${appointment.appointment_time}`,
  );
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatAppointmentTime(appointment) {
  return appointmentDateTime(appointment).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAppointmentDate(appointment) {
  return appointmentDateTime(appointment).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const PHOTO_ANALYSIS_FIELDS = [
  { key: "camera_maker", label: "Camera maker" },
  { key: "camera_model", label: "Camera model" },
  { key: "f_stop", label: "F-stop" },
  { key: "exposure_time", label: "Exposure time" },
  { key: "iso", label: "ISO" },
  { key: "focal_length", label: "Focal length" },
];

const COLLAGE_LAYOUTS = [
  { id: "mosaic", label: "Mosaic" },
  { id: "grid", label: "Classic grid" },
  { id: "editorial", label: "Editorial" },
];

function RequestCollagePage({
  authorization,
  onBack,
  onLogout,
  request,
  requestError,
  requestId,
  requestLoading,
}) {
  const [photos, setPhotos] = useState([]);
  const [imageSources, setImageSources] = useState({});
  const [activeLayout, setActiveLayout] = useState("mosaic");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const objectUrls = [];

    const loadRequestPhotos = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/requests/${requestId}/photos`, {
          headers: { Authorization: authorization },
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            responseMessage(result, "Couldn't load request photos."),
          );
        }

        const sources = await Promise.all(
          result.map(async (photo) => {
            const imageResponse = await fetch(photo.image_url, {
              headers: { Authorization: authorization },
            });
            if (!imageResponse.ok) {
              throw new Error(`Couldn't load ${photo.original_filename}.`);
            }
            const objectUrl = URL.createObjectURL(await imageResponse.blob());
            objectUrls.push(objectUrl);
            return [photo.id, objectUrl];
          }),
        );
        if (!cancelled) {
          setPhotos(result);
          setImageSources(Object.fromEntries(sources));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Couldn't load request photos.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadRequestPhotos();
    return () => {
      cancelled = true;
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };
  }, [authorization, refresh, requestId]);

  const handleUpload = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");
    const form = event.currentTarget;
    const files = Array.from(form.elements.photos.files);
    const remainingSlots = 15 - photos.length;
    if (files.length === 0) {
      setError("Choose at least one photo to upload.");
      return;
    }
    if (files.length > remainingSlots) {
      setError(
        `You can add up to ${remainingSlots} more photos to this request.`,
      );
      return;
    }

    setUploading(true);
    let uploadedCount = 0;
    const failures = [];
    for (const file of files) {
      const photoFormData = new FormData();
      photoFormData.append("image", file);
      try {
        const response = await fetch(`/api/requests/${requestId}/photos`, {
          method: "POST",
          headers: { Authorization: authorization },
          body: photoFormData,
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            responseMessage(result, "Couldn't upload this photo."),
          );
        }
        uploadedCount += 1;
      } catch (uploadError) {
        failures.push(
          `${file.name}: ${
            uploadError instanceof Error
              ? uploadError.message
              : "Couldn't upload this photo."
          }`,
        );
      }
    }

    form.reset();
    if (uploadedCount > 0) {
      setRefresh((currentRefresh) => currentRefresh + 1);
      setStatus(
        `${uploadedCount} ${
          uploadedCount === 1 ? "photo" : "photos"
        } added to this request.`,
      );
    }
    if (failures.length > 0) {
      setError(failures.join(" "));
    }
    setUploading(false);
  };

  const handleDeletePhoto = async (photo) => {
    setError("");
    setStatus("");
    setDeletingPhoto(photo.id);
    try {
      const response = await fetch(
        `/api/requests/${requestId}/photos/${encodeURIComponent(photo.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: authorization },
        },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          responseMessage(result, "Couldn't remove this request photo."),
        );
      }
      setRefresh((currentRefresh) => currentRefresh + 1);
      setStatus("Photo removed from this request.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Couldn't remove this request photo.",
      );
    } finally {
      setDeletingPhoto("");
    }
  };

  if (!request && !requestLoading) {
    return (
      <main className="photo-dashboard">
        <Link className="dashboard-text-button" to="/admin">
          Back to requests
        </Link>
        <p className="form-status" role="alert">
          {requestError || `Request #${requestId} could not be found.`}
        </p>
      </main>
    );
  }

  return (
    <main className="photo-dashboard">
      <header className="dashboard-heading">
        <div className="dashboard-heading-copy">
          <button
            className="dashboard-text-button"
            type="button"
            onClick={onBack}
          >
            ← Back to requests
          </button>
          <p className="eyebrow">REQUEST PHOTOS</p>
          <h1>
            {request ? `Request #${request.id}` : "Loading request..."}
          </h1>
          <p className="dashboard-intro">
            Upload up to 15 photos, then preview them in three collage styles.
          </p>
        </div>
        <button
          className="button button-outline dashboard-logout"
          type="button"
          onClick={onLogout}
        >
          Sign out
        </button>
      </header>

      <section className="dashboard-panel request-collage-panel">
        <div className="dashboard-library-heading">
          <div>
            <p className="eyebrow">PRIVATE TO THIS REQUEST</p>
            <h2>Photo collage</h2>
          </div>
          <span className="dashboard-count">{photos.length} / 15 photos</span>
        </div>

        <form className="request-photo-upload" onSubmit={handleUpload}>
          <label className="field-label" htmlFor="request-photo-files">
            Add photos
          </label>
          <input
            id="request-photo-files"
            name="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={uploading || photos.length >= 15}
          />
          <p className="field-hint">
            JPEG, PNG, or WebP. Choose {15 - photos.length} or fewer.
          </p>
          <button
            className="button button-dark"
            type="submit"
            disabled={uploading || photos.length >= 15}
          >
            {uploading ? "Uploading..." : "Upload selected photos"}
          </button>
        </form>

        {(error || status) && (
          <p
            className="form-status request-collage-feedback"
            role={error ? "alert" : "status"}
            aria-live="polite"
          >
            {error || status}
          </p>
        )}

        <div
          className="collage-tabs"
          role="tablist"
          aria-label="Collage formats"
        >
          {COLLAGE_LAYOUTS.map((layout) => (
            <button
              className="collage-tab"
              id={`collage-tab-${layout.id}`}
              type="button"
              role="tab"
              aria-selected={activeLayout === layout.id}
              aria-controls="collage-preview"
              key={layout.id}
              onClick={() => setActiveLayout(layout.id)}
            >
              {layout.label}
            </button>
          ))}
        </div>

        <div
          className={`request-collage request-collage-${activeLayout}`}
          id="collage-preview"
          role="tabpanel"
          aria-labelledby={`collage-tab-${activeLayout}`}
        >
          {loading && <p className="field-hint">Loading photos...</p>}
          {!loading && photos.length === 0 && (
            <p className="dashboard-empty">
              Upload photos to see your request collage here.
            </p>
          )}
          {photos.map((photo, index) => (
            <figure className="request-collage-item" key={photo.id}>
              {imageSources[photo.id] && (
                <img
                  src={imageSources[photo.id]}
                  alt={photo.original_filename}
                />
              )}
              <figcaption>{photo.original_filename}</figcaption>
              <button
                className="button button-outline request-photo-remove"
                type="button"
                disabled={deletingPhoto === photo.id}
                onClick={() => handleDeletePhoto(photo)}
              >
                {deletingPhoto === photo.id ? "Removing..." : "Remove"}
              </button>
              <span className="request-collage-index">
                {String(index + 1).padStart(2, "0")}
              </span>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}

function RequestPhotoUpload({ authorization, onUploaded, request }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const remainingSlots = Math.max(0, 15 - (request.photo_count || 0));

  const handleUpload = async (event) => {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const files = Array.from(form.elements.photos.files);
    if (files.length === 0) {
      setError("Choose at least one photo to upload.");
      return;
    }
    if (files.length > remainingSlots) {
      setError(`You can add up to ${remainingSlots} more photos.`);
      return;
    }

    setUploading(true);
    let uploadedCount = 0;
    const failures = [];
    for (const file of files) {
      const photoFormData = new FormData();
      photoFormData.append("image", file);
      try {
        const response = await fetch(`/api/requests/${request.id}/photos`, {
          method: "POST",
          headers: { Authorization: authorization },
          body: photoFormData,
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            responseMessage(result, "Couldn't upload this photo."),
          );
        }
        uploadedCount += 1;
      } catch (uploadError) {
        failures.push(
          `${file.name}: ${
            uploadError instanceof Error
              ? uploadError.message
              : "Couldn't upload this photo."
          }`,
        );
      }
    }

    form.reset();
    setUploading(false);
    if (uploadedCount > 0) {
      onUploaded(uploadedCount);
    }
    if (failures.length > 0) {
      setError(failures.join(" "));
    }
  };

  return (
    <div className="dashboard-request-photos">
      <div className="dashboard-request-photos-heading">
        <div>
          <strong>Photos for this request</strong>
          <span>
            {request.photo_count || 0} / 15 uploaded
          </span>
        </div>
        <Link
          className="button button-outline dashboard-request-collage"
          to={`/requests/${request.id}/collage`}
          target="_blank"
          rel="noreferrer"
        >
          Public collage
        </Link>
      </div>
      <form className="dashboard-request-photo-form" onSubmit={handleUpload}>
        <input
          aria-label={`Choose photos for request ${request.id}`}
          name="photos"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={uploading || remainingSlots === 0}
        />
        <span className="field-hint">
          {remainingSlots
            ? `Select up to ${remainingSlots} more photos.`
            : "This request has reached the 15-photo limit."}
        </span>
        <button
          className="button button-dark dashboard-request-collage"
          type="submit"
          disabled={uploading || remainingSlots === 0}
        >
          {uploading ? "Uploading..." : "Upload & open collage"}
        </button>
      </form>
      {error && (
        <p className="form-status" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function PhotoAdminPage() {
  const location = useLocation();
  const navigate = useNavigate();
  // Credentials are held only in component state and are cleared on sign-out.
  const [images, setImages] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [requests, setRequests] = useState([]);
  const [photoAnalysis, setPhotoAnalysis] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authorization, setAuthorization] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const [activeBookingTab, setActiveBookingTab] = useState("bookings");
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisRefresh, setAnalysisRefresh] = useState(0);
  const [analysisFilters, setAnalysisFilters] = useState({});
  const collageMatch = location.pathname.match(
    /^\/admin\/requests\/(\d+)\/collage\/?$/,
  );
  const collageRequestId = collageMatch ? Number(collageMatch[1]) : null;

  // Recalculate the total only when the loaded image list changes.
  const totalStorage = useMemo(
    () => images.reduce((total, image) => total + image.file_size, 0),
    [images],
  );

  const filteredPhotoAnalysis = useMemo(
    () =>
      photoAnalysis.filter((photo) =>
        PHOTO_ANALYSIS_FIELDS.every(
          (field) =>
            !analysisFilters[field.key] ||
            photo[field.key] === analysisFilters[field.key],
        ),
      ),
    [photoAnalysis, analysisFilters],
  );

  const analysisSummaries = useMemo(
    () =>
      PHOTO_ANALYSIS_FIELDS.map((field) => {
        const counts = filteredPhotoAnalysis.reduce((values, photo) => {
          const value = photo[field.key];
          if (value) {
            values.set(value, (values.get(value) || 0) + 1);
          }
          return values;
        }, new Map());
        const rankedValues = [...counts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((first, second) => second.count - first.count);
        const maximumCount = rankedValues[0]?.count || 0;
        const availableValues = photoAnalysis.reduce((values, photo) => {
          const value = photo[field.key];
          if (value) {
            values.set(value, (values.get(value) || 0) + 1);
          }
          return values;
        }, new Map());
        return {
          ...field,
          availableValues: [...availableValues.entries()]
            .map(([value, count]) => ({ value, count }))
            .sort((first, second) =>
              first.value.localeCompare(second.value, undefined, {
                numeric: true,
                sensitivity: "base",
              }),
            ),
          values: rankedValues.slice(0, 10).map((item) => ({
            ...item,
            percentage: (item.count / maximumCount) * 100,
          })),
          photoCount: [...counts.values()].reduce(
            (total, count) => total + count,
            0,
          ),
        };
      }),
    [filteredPhotoAnalysis, photoAnalysis],
  );

  // Load dashboard data only after the admin has authenticated.
  useEffect(() => {
    if (!authorization) {
      return;
    }

    const loadDashboard = async () => {
      setLoading(true);
      setRequestsLoading(true);
      setError("");
      setRequestsError("");
      try {
        const headers = { Authorization: authorization };
        const [photosResponse, appointmentsResponse] = await Promise.all([
          fetch("/api/photos", { headers }),
          fetch("/api/appointments/admin", { headers }),
        ]);
        const [photoResult, appointmentResult] = await Promise.all([
          photosResponse.json(),
          appointmentsResponse.json(),
        ]);
        if (!photosResponse.ok) {
          throw new Error(
            responseMessage(photoResult, "Couldn't load the photo library."),
          );
        }
        if (!appointmentsResponse.ok) {
          throw new Error(
            responseMessage(
              appointmentResult,
              "Couldn't load the appointment schedule.",
            ),
          );
        }
        setImages(photoResult);
        setAppointments(appointmentResult);
        try {
          const requestsResponse = await fetch("/api/requests/admin", {
            headers,
          });
          const requestsResult = await requestsResponse.json();
          if (!requestsResponse.ok) {
            throw new Error(
              responseMessage(requestsResult, "Couldn't load form requests."),
            );
          }
          setRequests(requestsResult);
        } catch (requestsLoadError) {
          setRequestsError(
            requestsLoadError instanceof Error
              ? requestsLoadError.message
              : "Couldn't load form requests.",
          );
        } finally {
          setRequestsLoading(false);
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Couldn't load the dashboard.",
        );
        setRequestsLoading(false);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [authorization]);

  useEffect(() => {
    if (
      !authorization ||
      activeSection !== "bookings" ||
      activeBookingTab !== "requests"
    ) {
      return;
    }

    let cancelled = false;
    const loadRequests = async () => {
      setRequestsLoading(true);
      setRequestsError("");
      try {
        const response = await fetch("/api/requests/admin", {
          headers: { Authorization: authorization },
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            responseMessage(result, "Couldn't load form requests."),
          );
        }
        if (!cancelled) {
          setRequests(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setRequestsError(
            loadError instanceof Error
              ? loadError.message
              : "Couldn't load form requests.",
          );
        }
      } finally {
        if (!cancelled) {
          setRequestsLoading(false);
        }
      }
    };

    loadRequests();
    return () => {
      cancelled = true;
    };
  }, [authorization, activeSection, activeBookingTab]);

  // Read EXIF only when the admin opens Analyze, and refresh when they revisit it.
  useEffect(() => {
    if (!authorization || activeSection !== "analyze") {
      return;
    }

    let cancelled = false;
    const loadAnalysis = async () => {
      setAnalysisLoading(true);
      setAnalysisError("");
      try {
        const response = await fetch("/api/photos/admin/analysis", {
          headers: { Authorization: authorization },
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            responseMessage(result, "Couldn't analyze photo metadata."),
          );
        }
        if (!cancelled) {
          setPhotoAnalysis(result);
          setAnalysisFilters((currentFilters) =>
            Object.fromEntries(
              Object.entries(currentFilters).filter(([field, value]) =>
                result.some((photo) => photo[field] === value),
              ),
            ),
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setAnalysisError(
            loadError instanceof Error
              ? loadError.message
              : "Couldn't analyze photo metadata.",
          );
        }
      } finally {
        if (!cancelled) {
          setAnalysisLoading(false);
        }
      }
    };

    loadAnalysis();
    return () => {
      cancelled = true;
    };
  }, [authorization, activeSection, analysisRefresh]);

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
    setAppointments([]);
    setRequests([]);
    setPhotoAnalysis([]);
    setAnalysisFilters({});
    setError("");
    setStatus("");
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const files = formData.getAll("image").filter((file) => file.size > 0);
    if (files.length === 0) {
      setError("Choose at least one photo to upload.");
      return;
    }

    setUploading(true);
    const uploadedImages = [];
    const failedUploads = [];
    try {
      for (const file of files) {
        const photoFormData = new FormData();
        photoFormData.append("image", file);

        try {
          const response = await fetch("/api/photos", {
            method: "POST",
            headers: { Authorization: authorization },
            body: photoFormData,
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(
              responseMessage(result, "Couldn't upload this photo."),
            );
          }
          uploadedImages.push(result);
        } catch (uploadError) {
          failedUploads.push({
            filename: file.name,
            message:
              uploadError instanceof Error
                ? uploadError.message
                : "Couldn't upload this photo.",
          });
        }
      }

      if (uploadedImages.length > 0) {
        setImages((currentImages) => [...uploadedImages, ...currentImages]);
      }
      if (failedUploads.length > 0) {
        const failureDetails = failedUploads
          .map(({ filename, message }) => `${filename}: ${message}`)
          .join(" ");
        setError(
          `${uploadedImages.length} of ${files.length} photos uploaded. ${failureDetails}`,
        );
      } else {
        setStatus(
          `${uploadedImages.length} ${
            uploadedImages.length === 1 ? "photo" : "photos"
          } uploaded and added to the public gallery.`,
        );
      }
      form.reset();
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

  const handleDeleteRequest = async (request) => {
    setRequestsError("");
    setStatus("");
    try {
      const response = await fetch(`/api/requests/${request.id}`, {
        method: "DELETE",
        headers: { Authorization: authorization },
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          responseMessage(result, "Couldn't delete this request."),
        );
      }

      setRequests((currentRequests) =>
        currentRequests.filter(
          (currentRequest) => currentRequest.id !== request.id,
        ),
      );
      setStatus(`Request #${request.id} deleted.`);
    } catch (deleteError) {
      setRequestsError(
        deleteError instanceof Error
          ? deleteError.message
          : "Couldn't delete this request.",
      );
    }
  };

  const handleFulfillRequest = async (request) => {
    setRequestsError("");
    setStatus("");
    try {
      const response = await fetch(`/api/requests/${request.id}/fulfill`, {
        method: "POST",
        headers: { Authorization: authorization },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          responseMessage(result, "Couldn't archive this request."),
        );
      }

      setRequests((currentRequests) =>
        currentRequests.map((currentRequest) =>
          currentRequest.id === request.id ? result : currentRequest,
        ),
      );
      setActiveBookingTab("archive");
      setStatus(`Request #${request.id} moved to the archive.`);
    } catch (fulfillError) {
      setRequestsError(
        fulfillError instanceof Error
          ? fulfillError.message
          : "Couldn't archive this request.",
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
            Sign in to manage your bookings and photography library.
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

  if (collageRequestId !== null) {
    return (
      <RequestCollagePage
        authorization={authorization}
        onBack={() => {
          setActiveBookingTab("requests");
          setActiveSection("bookings");
          navigate("/admin");
        }}
        onLogout={handleLogout}
        request={requests.find((item) => item.id === collageRequestId)}
        requestError={requestsError}
        requestId={collageRequestId}
        requestLoading={requestsLoading}
      />
    );
  }

  const todayKey = localDateKey(new Date());
  const upcomingAppointments = appointments.filter(
    (appointment) => appointmentDateTime(appointment) >= new Date(),
  );
  const todayAppointments = appointments.filter(
    (appointment) => appointment.appointment_date === todayKey,
  );
  const activeRequests = requests.filter((request) => !request.fulfilled_at);
  const archivedRequests = requests.filter((request) => request.fulfilled_at);

  return (
    <main className="photo-dashboard">
      <header className="dashboard-heading">
        <div className="dashboard-heading-copy">
          <p className="eyebrow">PRIVATE STUDIO · ADMINISTRATION</p>
          <h1>Studio dashboard</h1>
          <p className="dashboard-intro">
            Your bookings and photography collection, all in one place.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <span className="dashboard-date">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
          <button
            className="button button-outline dashboard-logout"
            type="button"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="dashboard-layout">
        <nav className="dashboard-sidebar" aria-label="Admin sections">
          <p className="dashboard-sidebar-label">WORKSPACE</p>
          {[
            { id: "overview", label: "Overview", icon: "01" },
            { id: "bookings", label: "Bookings", icon: "02" },
            { id: "analyze", label: "Analyze", icon: "03" },
            { id: "photos", label: "Photo library", icon: "04" },
            { id: "upload", label: "Upload photo", icon: "05" },
          ].map((section) => (
            <button
              className="dashboard-nav-link"
              type="button"
              key={section.id}
              aria-current={activeSection === section.id ? "page" : undefined}
              onClick={() => setActiveSection(section.id)}
            >
              <span className="dashboard-nav-number">{section.icon}</span>
              {section.label}
              {section.id === "bookings" && (
                <span className="dashboard-nav-count">
                  {appointments.length + requests.length}
                </span>
              )}
              {section.id === "photos" && (
                <span className="dashboard-nav-count">{images.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="dashboard-main">
          {(error || status) && (
            <p
              className="form-status dashboard-feedback"
              role={error ? "alert" : "status"}
              aria-live="polite"
            >
              {error || status}
            </p>
          )}

          {activeSection === "overview" && (
            <>
              <section
                className="dashboard-stats"
                aria-label="Studio summary"
              >
                <article className="dashboard-stat">
                  <span className="dashboard-stat-label">TOTAL BOOKINGS</span>
                  <strong>{appointments.length}</strong>
                  <span>All scheduled sessions</span>
                </article>
                <article className="dashboard-stat">
                  <span className="dashboard-stat-label">UPCOMING</span>
                  <strong>{upcomingAppointments.length}</strong>
                  <span>Sessions still to come</span>
                </article>
                <article className="dashboard-stat">
                  <span className="dashboard-stat-label">PHOTOS</span>
                  <strong>{images.length}</strong>
                  <span>In your public collection</span>
                </article>
                <article className="dashboard-stat">
                  <span className="dashboard-stat-label">IMAGE STORAGE</span>
                  <strong>{formatFileSize(totalStorage)}</strong>
                  <span>Across uploaded photos</span>
                </article>
              </section>
              <div className="dashboard-content dashboard-overview-content">
                <section className="dashboard-panel" aria-labelledby="today-title">
                  <div className="dashboard-library-heading">
                    <div>
                      <p className="eyebrow">YOUR SCHEDULE</p>
                      <h2 id="today-title">Today</h2>
                    </div>
                    <span className="dashboard-count">
                      {todayAppointments.length}{" "}
                      {todayAppointments.length === 1 ? "session" : "sessions"}
                    </span>
                  </div>
                  {loading && <p className="field-hint">Loading schedule...</p>}
                  {!loading && todayAppointments.length === 0 && (
                    <p className="dashboard-empty">
                      Nothing scheduled for today.
                    </p>
                  )}
                  <div className="dashboard-appointment-list">
                    {todayAppointments.map((appointment) => (
                      <article
                        className="dashboard-appointment"
                        key={appointment.id}
                      >
                        <time
                          className="dashboard-appointment-time"
                          dateTime={`${appointment.appointment_date}T${appointment.appointment_time}`}
                        >
                          {formatAppointmentTime(appointment)}
                        </time>
                        <div>
                          <strong>{appointment.customer_name}</strong>
                          <span>{appointment.session_type} session</span>
                        </div>
                      </article>
                    ))}
                  </div>
                  <button
                    className="dashboard-text-button"
                    type="button"
                    onClick={() => setActiveSection("bookings")}
                  >
                    View all bookings <span aria-hidden="true">↗</span>
                  </button>
                </section>

                <section
                  className="dashboard-panel"
                  aria-labelledby="overview-requests-title"
                >
                  <div className="dashboard-library-heading">
                    <div>
                      <p className="eyebrow">GOOGLE FORMS</p>
                      <h2 id="overview-requests-title">Recent requests</h2>
                    </div>
                    <span className="dashboard-count">
                      {activeRequests.length}{" "}
                      {activeRequests.length === 1 ? "request" : "requests"}
                    </span>
                  </div>
                  {requestsLoading && (
                    <p className="field-hint">Loading requests...</p>
                  )}
                  {requestsError && (
                    <p className="form-status" role="alert">
                      {requestsError}
                    </p>
                  )}
                  {!requestsLoading &&
                    !requestsError &&
                    activeRequests.length === 0 && (
                      <p className="dashboard-empty">
                        New form submissions will appear here.
                      </p>
                    )}
                  <div className="dashboard-overview-request-list">
                    {activeRequests.slice(0, 3).map((request) => (
                      <article
                        className="dashboard-overview-request"
                        key={request.id}
                      >
                        <div>
                          <strong>Request #{request.id}</strong>
                          <time dateTime={request.created_at}>
                            {formatDate(request.created_at)}
                          </time>
                        </div>
                        {Object.entries(request.form_data)
                          .slice(0, 2)
                          .map(([label, value]) => (
                            <p key={label}>
                              <span>{label}: </span>
                              {typeof value === "string"
                                ? value
                                : JSON.stringify(value)}
                            </p>
                          ))}
                      </article>
                    ))}
                  </div>
                  <button
                    className="dashboard-text-button"
                    type="button"
                    onClick={() => {
                      setActiveBookingTab("requests");
                      setActiveSection("bookings");
                    }}
                  >
                    View all requests <span aria-hidden="true">↗</span>
                  </button>
                </section>
                <section
                  className="dashboard-panel"
                  aria-labelledby="upcoming-title"
                >
                  <div className="dashboard-library-heading">
                    <div>
                      <p className="eyebrow">ON THE CALENDAR</p>
                      <h2 id="upcoming-title">Upcoming bookings</h2>
                    </div>
                  </div>
                  {loading && <p className="field-hint">Loading bookings...</p>}
                  {!loading && upcomingAppointments.length === 0 && (
                    <p className="dashboard-empty">
                      New bookings will appear here.
                    </p>
                  )}
                  <div className="dashboard-appointment-list">
                    {upcomingAppointments.slice(0, 5).map((appointment) => (
                      <article
                        className="dashboard-appointment"
                        key={appointment.id}
                      >
                        <time
                          className="dashboard-appointment-date"
                          dateTime={`${appointment.appointment_date}T${appointment.appointment_time}`}
                        >
                          <span>{formatAppointmentDate(appointment)}</span>
                          <span>{formatAppointmentTime(appointment)}</span>
                        </time>
                        <div>
                          <strong>{appointment.customer_name}</strong>
                          <span>{appointment.session_type} session</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
              <div className="dashboard-content dashboard-lower-content">
                <section className="dashboard-panel">
                  <div className="dashboard-library-heading">
                    <div>
                      <p className="eyebrow">YOUR COLLECTION</p>
                      <h2>Recent uploads</h2>
                    </div>
                    <button
                      className="dashboard-text-button"
                      type="button"
                      onClick={() => setActiveSection("photos")}
                    >
                      View library <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                  {loading && <p className="field-hint">Loading photos...</p>}
                  {!loading && images.length === 0 && (
                    <p className="dashboard-empty">
                      Your library is ready. Upload a photo to get started.
                    </p>
                  )}
                  {images.length > 0 && (
                    <div className="dashboard-recent-grid">
                      {images.slice(0, 3).map((image) => (
                        <figure
                          className="dashboard-recent-photo"
                          key={image.id}
                        >
                          <img
                            src={image.image_url}
                            alt={image.id}
                            loading="lazy"
                          />
                        </figure>
                      ))}
                    </div>
                  )}
                </section>
                <section className="dashboard-panel dashboard-quick-actions">
                  <p className="eyebrow">SHORTCUTS</p>
                  <h2>Quick actions</h2>
                  <Link className="dashboard-action-link" to="/book">
                    View booking page <span aria-hidden="true">↗</span>
                  </Link>
                  <button
                    className="dashboard-action-link"
                    type="button"
                    onClick={() => setActiveSection("upload")}
                  >
                    Upload a photo <span aria-hidden="true">↗</span>
                  </button>
                  <button
                    className="dashboard-action-link"
                    type="button"
                    onClick={() => setActiveSection("analyze")}
                  >
                    Analyze photo metadata <span aria-hidden="true">↗</span>
                  </button>
                </section>
              </div>
            </>
          )}

          {activeSection === "bookings" && (
            <section
              className="dashboard-panel"
              aria-labelledby={
                activeBookingTab === "bookings"
                  ? "bookings-title"
                  : activeBookingTab === "requests"
                    ? "requests-title"
                    : "archive-title"
              }
            >
              <div
                className="dashboard-booking-tabs"
                role="tablist"
                aria-label="Bookings, requests, and archive"
              >
                <button
                  className="dashboard-booking-tab"
                  id="bookings-tab"
                  type="button"
                  role="tab"
                  aria-selected={activeBookingTab === "bookings"}
                  aria-controls="bookings-tab-panel"
                  onClick={() => setActiveBookingTab("bookings")}
                >
                  Bookings
                </button>
                <button
                  className="dashboard-booking-tab"
                  id="requests-tab"
                  type="button"
                  role="tab"
                  aria-selected={activeBookingTab === "requests"}
                  aria-controls="requests-tab-panel"
                  onClick={() => setActiveBookingTab("requests")}
                >
                  Requests
                </button>
                <button
                  className="dashboard-booking-tab"
                  id="archive-tab"
                  type="button"
                  role="tab"
                  aria-selected={activeBookingTab === "archive"}
                  aria-controls="archive-tab-panel"
                  onClick={() => setActiveBookingTab("archive")}
                >
                  Archive
                  {archivedRequests.length > 0 && (
                    <span className="dashboard-tab-count">
                      {archivedRequests.length}
                    </span>
                  )}
                </button>
              </div>
              <div
                id="bookings-tab-panel"
                role="tabpanel"
                aria-labelledby="bookings-tab"
                hidden={activeBookingTab !== "bookings"}
              >
                  <div className="dashboard-library-heading">
                    <div>
                      <p className="eyebrow">SESSION SCHEDULE</p>
                      <h2 id="bookings-title">Bookings</h2>
                    </div>
                    <span className="dashboard-count">
                      {appointments.length}{" "}
                      {appointments.length === 1 ? "booking" : "bookings"}
                    </span>
                  </div>
                  {loading && (
                    <p className="field-hint">Loading bookings...</p>
                  )}
                  {!loading && appointments.length === 0 && (
                    <p className="dashboard-empty">
                      Bookings will appear here when a session is scheduled.
                    </p>
                  )}
                  <div className="dashboard-booking-list">
                    {appointments.map((appointment) => (
                      <article
                        className="dashboard-booking"
                        key={appointment.id}
                      >
                        <div className="dashboard-booking-date">
                          <span>{formatAppointmentDate(appointment)}</span>
                          <strong>{formatAppointmentTime(appointment)}</strong>
                        </div>
                        <div className="dashboard-booking-customer">
                          <strong>{appointment.customer_name}</strong>
                          <a href={`mailto:${appointment.email}`}>
                            {appointment.email}
                          </a>
                          {appointment.phone && (
                            <span>{appointment.phone}</span>
                          )}
                        </div>
                        <span className="dashboard-session-type">
                          {appointment.session_type}
                        </span>
                        {appointment.notes && (
                          <p className="dashboard-booking-notes">
                            {appointment.notes}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
              </div>
              <div
                id="requests-tab-panel"
                role="tabpanel"
                aria-labelledby="requests-tab"
                hidden={activeBookingTab !== "requests"}
                tabIndex={0}
              >
                  <div className="dashboard-library-heading">
                    <div>
                      <p className="eyebrow">GOOGLE FORMS</p>
                      <h2 id="requests-title">Requests</h2>
                    </div>
                    <span className="dashboard-count">
                      {activeRequests.length}{" "}
                      {activeRequests.length === 1 ? "request" : "requests"}
                    </span>
                  </div>
                  {requestsLoading && (
                    <p className="field-hint">Loading requests...</p>
                  )}
                  {requestsError && (
                    <p className="form-status" role="alert">
                      {requestsError}
                    </p>
                  )}
                  {!requestsLoading &&
                    !requestsError &&
                    activeRequests.length === 0 && (
                      <p className="dashboard-empty">
                        Google Forms submissions will appear here when n8n
                        sends them to the dashboard.
                      </p>
                    )}
                  <div className="dashboard-request-list">
                    {activeRequests.map((request) => (
                      <article
                        className="dashboard-request"
                        key={request.id}
                      >
                        <div className="dashboard-request-heading">
                          <h3>Request #{request.id}</h3>
                          <time dateTime={request.created_at}>
                            Received {formatDate(request.created_at)}
                          </time>
                          <button
                            className="button button-outline dashboard-request-fulfill"
                            type="button"
                            onClick={() => handleFulfillRequest(request)}
                          >
                            Request fulfilled
                          </button>
                          <button
                            className="button button-outline dashboard-request-delete"
                            type="button"
                            onClick={() => handleDeleteRequest(request)}
                          >
                            Delete request
                          </button>
                        </div>
                        <dl className="dashboard-request-fields">
                          {Object.entries(request.form_data).map(
                            ([label, value]) => (
                              <div key={label}>
                                <dt>{label}</dt>
                                <dd>
                                  {typeof value === "string"
                                    ? value
                                    : JSON.stringify(value)}
                                </dd>
                              </div>
                            ),
                          )}
                        </dl>
                        <RequestPhotoUpload
                          authorization={authorization}
                          onUploaded={(uploadedCount) => {
                            setRequests((currentRequests) =>
                              currentRequests.map((currentRequest) =>
                                currentRequest.id === request.id
                                  ? {
                                      ...currentRequest,
                                      photo_count:
                                        (currentRequest.photo_count || 0) +
                                        uploadedCount,
                                    }
                                  : currentRequest,
                              ),
                            );
                            navigate(`/admin/requests/${request.id}/collage`);
                          }}
                          request={request}
                        />
                      </article>
                    ))}
                  </div>
              </div>
              <div
                id="archive-tab-panel"
                role="tabpanel"
                aria-labelledby="archive-tab"
                hidden={activeBookingTab !== "archive"}
                tabIndex={0}
              >
                <div className="dashboard-library-heading">
                  <div>
                    <p className="eyebrow">COMPLETED REQUESTS</p>
                    <h2 id="archive-title">Archive</h2>
                  </div>
                  <span className="dashboard-count">
                    {archivedRequests.length}{" "}
                    {archivedRequests.length === 1 ? "request" : "requests"}
                  </span>
                </div>
                {!requestsLoading &&
                  !requestsError &&
                  archivedRequests.length === 0 && (
                    <p className="dashboard-empty">
                      Requests marked fulfilled will appear here.
                    </p>
                  )}
                <div className="dashboard-request-list">
                  {archivedRequests.map((request) => (
                    <article
                      className="dashboard-request"
                      key={request.id}
                    >
                      <div className="dashboard-request-heading">
                        <h3>Request #{request.id}</h3>
                        <time dateTime={request.fulfilled_at}>
                          Fulfilled {formatDate(request.fulfilled_at)}
                        </time>
                        <Link
                          className="button button-outline dashboard-request-collage"
                          to={`/requests/${request.id}/collage`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Public collage
                        </Link>
                        <button
                          className="button button-outline dashboard-request-delete"
                          type="button"
                          onClick={() => handleDeleteRequest(request)}
                        >
                          Delete request
                        </button>
                      </div>
                      <dl className="dashboard-request-fields">
                        {Object.entries(request.form_data).map(
                          ([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>
                                {typeof value === "string"
                                  ? value
                                  : JSON.stringify(value)}
                              </dd>
                            </div>
                          ),
                        )}
                      </dl>
                      <p className="dashboard-request-photo-count">
                        {request.photo_count}{" "}
                        {request.photo_count === 1 ? "photo" : "photos"}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeSection === "analyze" && (
            <section
              className="dashboard-panel"
              aria-labelledby="analysis-title"
            >
              <div className="dashboard-library-heading">
                <div>
                  <p className="eyebrow">PHOTO METADATA</p>
                  <h2 id="analysis-title">Analyze</h2>
                </div>
                <button
                  className="dashboard-text-button"
                  type="button"
                  onClick={() => setAnalysisRefresh((value) => value + 1)}
                  disabled={analysisLoading}
                >
                  {analysisLoading ? "Analyzing..." : "Refresh analysis"}
                </button>
              </div>
              <p className="dashboard-analysis-intro">
                Camera and exposure details read from EXIF data in your
                uploaded photos. Choose values in any chart to filter the
                dataset; multiple filters are combined.
              </p>
              {analysisError && (
                <p className="form-status" role="alert">
                  {analysisError}
                </p>
              )}
              {analysisLoading && (
                <p className="field-hint">Reading photo metadata...</p>
              )}
              {!analysisLoading &&
                !analysisError &&
                photoAnalysis.length === 0 && (
                  <p className="dashboard-empty">
                    Upload photos with EXIF metadata to see camera and exposure
                    insights.
                  </p>
                )}
              {photoAnalysis.length > 0 && (
                <>
                  <div className="dashboard-analysis-toolbar">
                    <p className="dashboard-analysis-count">
                      Showing {filteredPhotoAnalysis.length} of{" "}
                      {photoAnalysis.length} photos ·{" "}
                      {
                        filteredPhotoAnalysis.filter((photo) =>
                          PHOTO_ANALYSIS_FIELDS.some(
                            (field) => photo[field.key],
                          ),
                        ).length
                      }{" "}
                      with camera or exposure data
                    </p>
                    {Object.keys(analysisFilters).length > 0 && (
                      <button
                        className="dashboard-text-button"
                        type="button"
                        onClick={() => setAnalysisFilters({})}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                  {filteredPhotoAnalysis.length === 0 && (
                    <p className="dashboard-empty">
                      No photos match the selected filters. Clear a filter to
                      see more results.
                    </p>
                  )}
                  {filteredPhotoAnalysis.length > 0 &&
                    filteredPhotoAnalysis.filter((photo) =>
                      PHOTO_ANALYSIS_FIELDS.some((field) => photo[field.key]),
                    ).length === 0 && (
                      <p className="dashboard-empty">
                        These photos do not contain camera or exposure
                        metadata.
                      </p>
                    )}
                  <div className="dashboard-analysis-grid">
                    {analysisSummaries.map((summary) => (
                      <section
                        className="dashboard-analysis-card"
                        key={summary.key}
                        aria-label={summary.label}
                      >
                        <div className="dashboard-analysis-card-heading">
                          <h3>{summary.label}</h3>
                          <span>
                            {summary.photoCount}{" "}
                            {summary.photoCount === 1 ? "photo" : "photos"}
                          </span>
                        </div>
                        <label
                          className="dashboard-analysis-filter"
                          htmlFor={`analysis-filter-${summary.key}`}
                        >
                          <span>Filter {summary.label.toLowerCase()}</span>
                          <select
                            id={`analysis-filter-${summary.key}`}
                            value={analysisFilters[summary.key] || ""}
                            disabled={summary.availableValues.length === 0}
                            onChange={(event) => {
                              const { value } = event.target;
                              setAnalysisFilters((currentFilters) => {
                                const nextFilters = { ...currentFilters };
                                if (value) {
                                  nextFilters[summary.key] = value;
                                } else {
                                  delete nextFilters[summary.key];
                                }
                                return nextFilters;
                              });
                            }}
                          >
                            <option value="">All values</option>
                            {summary.availableValues.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.value} ({item.count})
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="dashboard-analysis-chart-label">
                          Most used
                        </p>
                        {summary.values.length === 0 ? (
                          <p className="dashboard-analysis-empty">
                            No values match this filter
                          </p>
                        ) : (
                          <ul className="dashboard-analysis-values">
                            {summary.values.map((item) => (
                              <li key={item.value}>
                                <div
                                  className="dashboard-analysis-bar"
                                  aria-hidden="true"
                                >
                                  <span
                                    style={{ width: `${item.percentage}%` }}
                                  />
                                </div>
                                <span className="dashboard-analysis-value">
                                  {item.value}
                                </span>
                                <span className="dashboard-analysis-count">
                                  {item.count}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {activeSection === "photos" && (
            <section
              className="dashboard-panel dashboard-library"
              aria-labelledby="photo-library-title"
            >
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
                    <figure
                      className="uploaded-photo dashboard-photo"
                      key={image.id}
                    >
                      <img
                        src={image.image_url}
                        alt={image.id}
                        loading="lazy"
                      />
                      <figcaption>
                        <strong>{image.id}</strong>
                        <span>{image.id}</span>
                        <span>
                          {formatFileSize(image.file_size)} ·{" "}
                          {formatDate(image.created_at)}
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
          )}

          {activeSection === "upload" && (
            <section className="dashboard-panel dashboard-upload-panel">
              <div className="dashboard-panel-heading">
                <p className="eyebrow">ADD TO THE COLLECTION</p>
                <h2>Upload photos</h2>
                <p>JPEG, PNG, or WebP · up to 100 MB each</p>
              </div>
              <form
                className="booking-form photo-upload-form"
                onSubmit={handleUpload}
              >
                <div className="form-field">
                  <label className="field-label" htmlFor="photo-file">
                    Choose photos
                  </label>
                  <input
                    id="photo-file"
                    name="image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    required
                  />
                </div>
                <button
                  className="button button-dark submit-button"
                  type="submit"
                  disabled={uploading}
                >
                  {uploading ? "Uploading photos..." : "Upload photos"}
                </button>
              </form>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
