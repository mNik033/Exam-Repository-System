import React, { useState, useEffect } from "react";
import PageHeader from "../UI/PageHeader";
import ReactMarkdown from "react-markdown";
import { UploadCloud, Bot, Search, ShieldCheck } from "lucide-react";

export default function AboutUs() {
  const [releases, setReleases] = useState([]);
  const [loadingReleases, setLoadingReleases] = useState(true);

  useEffect(() => {
    const repoUrl = import.meta.env.VITE_GITHUB_REPO_URL;
    if (!repoUrl) {
      console.warn("VITE_GITHUB_REPO_URL is not set.");
      setLoadingReleases(false);
      return;
    }

    fetch(repoUrl)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setReleases(data);
        }
      })
      .catch(err => console.error("Failed to fetch GitHub releases:", err))
      .finally(() => setLoadingReleases(false));
  }, []);

  return (
    <div className="page-wrapper with-navbar dot-pattern-bg">
      <div className="page-content">

        {/* Header */}
        <PageHeader
          label="About"
          title={<>Exam Prep, <span className="italic-serif">Centralized</span></>}
          description="A community-driven directory built to bring organization, searchability, and high-quality, verified solutions to previous year university exams."
          style={{ marginBottom: 48 }}
        />

        <div className="about-grid">
          {/* How it Works (Timeline) */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 className="text-headline-medium serif-heading" style={{ marginBottom: '32px' }}>How it Works</h2>

            <div className="auth-sidebar-timeline">
              {/* Step 1 */}
              <div className="auth-sidebar-step">
                <div className="auth-sidebar-step-col">
                  <div className="auth-sidebar-icon-box">
                    <Search size={16} />
                  </div>
                  <div className="auth-sidebar-connector" />
                </div>
                <div>
                  <h4 className="serif-heading auth-sidebar-step-title" style={{ color: 'var(--md-primary)' }}>Smart Search & Tagging</h4>
                  <p className="auth-sidebar-step-desc">
                    No more sorting through cluttered group chats or local downloads. The platform indexes exam files by course code, session, and exam type for efficient preparation. More importantly, you can search for specific topics to see exactly which past papers they appeared in, and read the exact question. Try searching for 'deadlock' on the dashboard to see it in action!
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="auth-sidebar-step">
                <div className="auth-sidebar-step-col">
                  <div className="auth-sidebar-icon-box">
                    <Bot size={16} />
                  </div>
                  <div className="auth-sidebar-connector" />
                </div>
                <div>
                  <h4 className="serif-heading auth-sidebar-step-title" style={{ color: 'var(--md-primary)' }}>Rapid Processing, Gradual Upgrades</h4>
                  <p className="auth-sidebar-step-desc">
                    Uploaded papers are instantly queued for processing using a highly efficient model to generate initial solutions quickly. Because it requires more processing time, the system later runs these papers through a slower but more powerful model in the background to provide even more detailed answers.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="auth-sidebar-step">
                <div className="auth-sidebar-step-col">
                  <div className="auth-sidebar-icon-box">
                    <UploadCloud size={16} />
                  </div>
                  <div className="auth-sidebar-connector" />
                </div>
                <div>
                  <h4 className="serif-heading auth-sidebar-step-title" style={{ color: 'var(--md-primary)' }}>Contribute & Unlock</h4>
                  <p className="auth-sidebar-step-desc">
                    Every verified upload and referral adds credits to your account. You can use these credits to instantly unlock solutions for your own prep. Contributing your past papers helps make sure the answers are already there when exam season rolls around. (Or you can always just purchase credits directly.)
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="auth-sidebar-step">
                <div className="auth-sidebar-step-col">
                  <div className="auth-sidebar-icon-box">
                    <ShieldCheck size={16} />
                  </div>
                </div>
                <div>
                  <h4 className="serif-heading auth-sidebar-step-title" style={{ color: 'var(--md-primary)' }}>Spam & Quality Control</h4>
                  <p className="auth-sidebar-step-desc">
                    Every upload is scanned by automated AI checks to prevent spam or unrelated files from slipping in. If a bad file does make it past the initial screen, the community can flag it to be reviewed and taken down, keeping the repository clean.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Changelog */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 className="text-headline-medium serif-heading" style={{ marginBottom: '24px' }}>Changelog</h2>

            {loadingReleases ? (
              <div className="text-body-medium">Loading changelog...</div>
            ) : releases.length === 0 ? (
              <div className="text-body-medium">No releases found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="card-elevated" style={{ padding: '24px', border: '1px solid var(--md-outline-variant)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h4 className="serif-heading auth-sidebar-step-title" style={{ color: 'var(--md-primary)', margin: 0 }}>
                      {releases[0].name || releases[0].tag_name}
                    </h4>
                    <span className="badge badge-primary">
                      {releases[0].tag_name}
                    </span>
                  </div>
                  <span className="auth-sidebar-step-desc" style={{ display: 'block', marginBottom: '16px' }}>
                    {new Date(releases[0].published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>

                  <div className="auth-sidebar-step-desc markdown-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem', opacity: 0.7 }}>
                    <ReactMarkdown>{releases[0].body}</ReactMarkdown>
                  </div>
                </div>

                <a
                  href={releases[0].html_url.replace(/\/tag\/.*$/, "")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outlined"
                  style={{ alignSelf: 'flex-start', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  View Previous Updates
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
