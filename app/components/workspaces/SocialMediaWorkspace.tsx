"use client";

import { useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

interface SocialPost {
  id: string;
  platform: "linkedin" | "instagram" | "google";
  title: string;
  excerpt: string;
  publishedDate: string;
  impressions: number;
  engagements: number;
}

const RECENT_POSTS: SocialPost[] = [
  {
    id: "post-1",
    platform: "linkedin",
    title: "Understanding Serotonin-Norepinephrine Reuptake in Treatment-Resistant Anxiety",
    excerpt: "Clinical insights on dosage titration, tolerability profiles, and therapeutic adjuncts...",
    publishedDate: "Yesterday",
    impressions: 1420,
    engagements: 89,
  },
  {
    id: "post-2",
    platform: "google",
    title: "Clinic Announcement: Expanded Saturday Morning Telehealth Slots",
    excerpt: "To better serve working professionals and students, our psychiatry clinic is now offering...",
    publishedDate: "3 days ago",
    impressions: 890,
    engagements: 45,
  },
  {
    id: "post-3",
    platform: "instagram",
    title: "5 Evidence-Based Sleep Hygiene Tips for Adults with ADHD",
    excerpt: "Why stimulant timing and circadian rhythm cues make all the difference in sleep architecture...",
    publishedDate: "Sep 07, 2026",
    impressions: 2310,
    engagements: 215,
  },
];

export default function SocialMediaWorkspace() {
  const [posts, setPosts] = useState<SocialPost[]>(RECENT_POSTS);
  const [postDraft, setPostDraft] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<"all" | "linkedin" | "google" | "instagram">("all");
  const [targetChannel, setTargetChannel] = useState<"linkedin" | "google" | "instagram">("linkedin");
  const [notice, setNotice] = useState<{ type: "warning" | "info" | "error"; text: string } | null>(null);

  const handlePublish = () => {
    if (!postDraft.trim()) return;
    const newPost: SocialPost = {
      id: `post-${Date.now()}`,
      platform: targetChannel,
      title: postDraft.slice(0, 60) + (postDraft.length > 60 ? "..." : ""),
      excerpt: postDraft,
      publishedDate: "Draft (Unpublished)",
      impressions: 0,
      engagements: 0,
    };
    setPosts([newPost, ...posts]);
    setPostDraft("");
    setNotice({
      type: "warning",
      text: "Social publishing unavailable: External social media platforms are not connected. Post saved locally as draft; no publication occurred.",
    });
  };

  const filteredPosts = posts.filter((p) => selectedPlatform === "all" || p.platform === selectedPlatform);

  return (
    <div className="practice-subworkspace social-workspace">
      <div data-social-integration="unconfigured" className="practice-banner-notice">
        <Icon name="info" />
        <span>Social media &amp; reputation platforms (Google Business, LinkedIn, Instagram) are not connected. Outbound publishing is unavailable; posts operate in local draft mode.</span>
      </div>

      {notice && (
        <div className={`practice-banner-${notice.type}`}>
          <Icon name={notice.type === "warning" ? "warning" : notice.type === "error" ? "error" : "check_circle"} /> {notice.text}
        </div>
      )}

      <div className="workspace-page-header">
        <div>
          <h2>Practice Social Media &amp; Reputation Hub</h2>
          <p>Manage your Google Business Profile, LinkedIn clinical articles, Instagram psychoeducation, and patient reviews.</p>
        </div>
      </div>

      {/* KPI stats */}
      <div className="billing-metrics-grid">
        <div className="billing-metric-card">
          <span className="metric-label">Google Practice Rating</span>
          <span className="metric-value" style={{ color: "var(--text-muted, #64748b)", fontSize: "1.1rem" }}>Not connected</span>
          <span className="metric-sub">Requires Google Business Profile integration</span>
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">Monthly Audience Reach</span>
          <span className="metric-value" style={{ color: "var(--text-muted, #64748b)", fontSize: "1.1rem" }}>Not connected</span>
          <span className="metric-sub">Requires social channel sync</span>
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">New Inquiries from Search</span>
          <span className="metric-value" style={{ color: "var(--text-muted, #64748b)", fontSize: "1.1rem" }}>Not connected</span>
          <span className="metric-sub">External analytics unconfigured</span>
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">Reputation Status</span>
          <span className="metric-value" style={{ color: "var(--text-muted, #64748b)", fontSize: "1.1rem" }}>Pending setup</span>
          <span className="metric-sub">0 external channels connected</span>
        </div>
      </div>

      <div className="social-layout-grid">
        {/* Post Composer & Feeds */}
        <div className="social-main-column">
          <div className="social-composer-card">
            <h3>Publish Practice Announcement or Article</h3>
            <div className="channel-selector-row">
              <label>Destination:</label>
              <div className="channel-chips">
                <button
                  type="button"
                  className={`channel-chip ${targetChannel === "linkedin" ? "active" : ""}`}
                  onClick={() => setTargetChannel("linkedin")}
                >
                  <Icon name="business_center" size="sm" /> LinkedIn
                </button>
                <button
                  type="button"
                  className={`channel-chip ${targetChannel === "google" ? "active" : ""}`}
                  onClick={() => setTargetChannel("google")}
                >
                  <Icon name="store" size="sm" /> Google Business
                </button>
                <button
                  type="button"
                  className={`channel-chip ${targetChannel === "instagram" ? "active" : ""}`}
                  onClick={() => setTargetChannel("instagram")}
                >
                  <Icon name="photo_camera" size="sm" /> Instagram
                </button>
              </div>
            </div>

            <textarea
              className="social-textarea"
              rows={3}
              placeholder="Write a clinical update, psychoeducation tip, or practice announcement..."
              value={postDraft}
              onChange={(e) => setPostDraft(e.target.value)}
            />

            <div className="composer-actions">
              <span className="composer-hint">All posts adhere to HIPAA privacy and medical board guidelines.</span>
              {!postDraft.trim() ? (
                <Button size="sm" icon="save" disabled disabledReason="Enter post text to draft">
                  Save as Draft
                </Button>
              ) : (
                <Button size="sm" icon="save" onClick={handlePublish}>
                  Save as Draft (Publishing Unavailable)
                </Button>
              )}
            </div>
          </div>

          <div className="social-feed-card">
            <div className="feed-filter-bar">
              <h4>Recent Posts &amp; Updates</h4>
              <div className="filter-pill-group">
                <button
                  type="button"
                  className={`filter-pill ${selectedPlatform === "all" ? "active" : ""}`}
                  onClick={() => setSelectedPlatform("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`filter-pill ${selectedPlatform === "linkedin" ? "active" : ""}`}
                  onClick={() => setSelectedPlatform("linkedin")}
                >
                  LinkedIn
                </button>
                <button
                  type="button"
                  className={`filter-pill ${selectedPlatform === "google" ? "active" : ""}`}
                  onClick={() => setSelectedPlatform("google")}
                >
                  Google
                </button>
                <button
                  type="button"
                  className={`filter-pill ${selectedPlatform === "instagram" ? "active" : ""}`}
                  onClick={() => setSelectedPlatform("instagram")}
                >
                  Instagram
                </button>
              </div>
            </div>

            <div className="social-posts-list">
              {filteredPosts.map((post) => (
                <div key={post.id} className="social-post-item">
                  <div className="post-platform-badge">
                    <Icon name={post.platform === "linkedin" ? "business_center" : post.platform === "google" ? "store" : "photo_camera"} size="sm" />
                    <span>{post.platform.toUpperCase()}</span>
                    <span className="post-date">· {post.publishedDate}</span>
                  </div>
                  <h5 className="post-title">{post.title}</h5>
                  <p className="post-excerpt">{post.excerpt}</p>
                  <div className="post-stats">
                    <span>👁️ {post.impressions.toLocaleString()} views</span>
                    <span>💬 {post.engagements} interactions</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Google Reviews Sidebar */}
        <aside className="social-reviews-sidebar">
          <div className="reviews-header">
            <h3>Google Patient Reviews</h3>
            <span className="verified-badge">Verified Practice</span>
          </div>

          <div className="review-card">
            <div className="review-stars">★★★★★</div>
            <p className="review-text">
              &quot;Dr. Taylor was incredibly thoughtful during my consultation. The online booking and clear communication made a huge difference.&quot;
            </p>
            <div className="review-meta">
              <span>Verified Patient · 4 days ago</span>
            </div>
          </div>

          <div className="review-card">
            <div className="review-stars">★★★★★</div>
            <p className="review-text">
              &quot;Prompt, compassionate care without long waiting room delays. The portal and SMS reminders are seamless.&quot;
            </p>
            <div className="review-meta">
              <span>Verified Patient · 1 week ago</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
