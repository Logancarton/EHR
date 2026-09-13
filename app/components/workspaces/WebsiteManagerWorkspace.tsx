"use client";

import { useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

export default function WebsiteManagerWorkspace() {
  const [practiceName, setPracticeName] = useState("Clinical Bond Psychiatric Care");
  const [tagline, setTagline] = useState("Evidence-based psychiatric medicine & modern psychotherapy");
  const [phone, setPhone] = useState("(415) 890-2300");
  const [address, setAddress] = useState("450 Sutter St, Suite 1200, San Francisco, CA 94108");
  const [acceptingPatients, setAcceptingPatients] = useState(true);
  const [telehealthAvailable, setTelehealthAvailable] = useState(true);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const handleSave = () => {
    setSavedNotice("Public website changes deployed live to clinicalbondpsych.com");
    setTimeout(() => setSavedNotice(null), 3000);
  };

  return (
    <div className="practice-subworkspace website-workspace">
      {savedNotice && (
        <div className="practice-banner-success">
          <Icon name="check_circle" /> {savedNotice}
        </div>
      )}

      <div className="workspace-page-header">
        <div>
          <h2>Clinic Website &amp; Patient Portal CMS</h2>
          <p>Manage your public practice website, provider bios, online appointment booking widget, and clinic SEO.</p>
        </div>
        <div className="header-actions">
          <Button size="sm" icon="open_in_new">
            Preview Live Site
          </Button>
          <Button size="sm" icon="publish" onClick={handleSave}>
            Publish Changes
          </Button>
        </div>
      </div>

      <div className="website-grid">
        {/* Editor Form */}
        <div className="website-editor-card">
          <h3>Practice Branding &amp; Contact</h3>
          <div className="form-group">
            <label>Practice Headline</label>
            <input
              type="text"
              className="text-input"
              value={practiceName}
              onChange={(e) => setPracticeName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Mission / Tagline</label>
            <input
              type="text"
              className="text-input"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Public Inquiries Phone</label>
              <input
                type="text"
                className="text-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Clinic Suite / Address</label>
              <input
                type="text"
                className="text-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="toggles-section">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={acceptingPatients}
                onChange={(e) => setAcceptingPatients(e.target.checked)}
              />
              <span>Accepting New Patients Banner</span>
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={telehealthAvailable}
                onChange={(e) => setTelehealthAvailable(e.target.checked)}
              />
              <span>Highlight HIPAA Telehealth Visits</span>
            </label>
          </div>

          <h3 style={{ marginTop: "1.5rem" }}>Online Scheduling Widget</h3>
          <div className="scheduling-embed-card">
            <div className="embed-info">
              <Icon name="event_available" />
              <div>
                <strong>Direct Patient Self-Booking Enabled</strong>
                <p>New patient intakes and 30-min medication evaluations feed directly into your EHR Today schedule.</p>
              </div>
            </div>
            <code className="embed-code">
              &lt;script src=&quot;https://cdn.clinicalbond.com/widget/booking.js&quot; data-clinic=&quot;sutter-1200&quot;&gt;&lt;/script&gt;
            </code>
          </div>
        </div>

        {/* Live Site Mockup Preview */}
        <div className="website-preview-card">
          <div className="browser-mockup-bar">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
            <span className="mockup-url">https://clinicalbondpsych.com</span>
          </div>

          <div className="mockup-hero">
            <span className="mockup-pill">{acceptingPatients ? "✦ Accepting New Patients" : "Waitlist Open"}</span>
            <h4>{practiceName}</h4>
            <p className="mockup-tagline">{tagline}</p>
            <div className="mockup-cta-row">
              <button type="button" className="mockup-btn-primary">Book Consultation</button>
              <button type="button" className="mockup-btn-secondary">Patient Portal</button>
            </div>
          </div>

          <div className="mockup-features">
            <div className="mockup-feature-box">
              <Icon name="psychology" />
              <strong>Psychopharmacology</strong>
              <span>Targeted medication management</span>
            </div>
            <div className="mockup-feature-box">
              <Icon name="video_camera_front" />
              <strong>Telepsychiatry</strong>
              <span>{telehealthAvailable ? "Available throughout CA & NY" : "In-office visits"}</span>
            </div>
            <div className="mockup-feature-box">
              <Icon name="verified_user" />
              <strong>Insurance Accepted</strong>
              <span>Aetna, BCBS, Optum &amp; Medicare</span>
            </div>
          </div>

          <div className="mockup-footer">
            <span>📞 {phone}</span>
            <span>📍 {address}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
