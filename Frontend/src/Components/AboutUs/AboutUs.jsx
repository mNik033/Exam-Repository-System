import React from "react";
import { Github, Linkedin, Mail, GraduationCap } from "lucide-react";
import mayank from "../../Assets/mayank.jpg";
import lamba from "../../Assets/lamba.jpg";
import nikhil from "../../Assets/nikhil.jpg";
import PageHeader from "../UI/PageHeader";

const developers = [
  {
    image: mayank,
    name: "Mayank Gupta",
    role: "Fullstack Developer",
    text: "Computer Science undergrad at IIT (ISM) Dhanbad. Passionate about building highly responsive, intuitive frontend user interfaces and architecting robust cloud integrations.",
    github: "https://github.com",
    linkedin: "https://linkedin.com",
    container: "var(--md-primary-container)",
    onContainer: "var(--md-on-primary-container)",
  },
  {
    image: nikhil,
    name: "Nikhil Kumar",
    role: "Fullstack Developer",
    text: "Computer Science undergrad at IIT (ISM) Dhanbad. Loves optimizing database operations, creating secure token flows, and designing scalable system architectures.",
    github: "https://github.com",
    linkedin: "https://linkedin.com",
    container: "var(--md-secondary-container)",
    onContainer: "var(--md-on-secondary-container)",
  },
  {
    image: lamba,
    name: "Nishant",
    role: "Backend & ML Engineer",
    text: "Computer Science undergrad at IIT (ISM) Dhanbad. Specializes in designing ML parser models, parsing dense PDFs, and developing high-performance Python services.",
    github: "https://github.com",
    linkedin: "https://linkedin.com",
    container: "var(--md-tertiary-container)",
    onContainer: "var(--md-on-tertiary-container)",
  },
];

export default function AboutUs() {
  return (
    <div className="page-wrapper with-navbar dot-pattern-bg">
      <div className="page-content">
        {/* Header */}
        <PageHeader
          label="The Team"
          title={<>Meet the <span className="italic-serif">Developers</span></>}
          description="We're student developers from IIT (ISM) Dhanbad, building tools that make exam prep accessible, smart, and verified for everyone."
          style={{ marginBottom: 48 }}
        />

        {/* Developer Cards */}
        <div className="dev-grid stagger-children">
          {developers.map((dev) => (
            <div
              key={dev.name}
              className="card-elevated dev-card"
            >
              {/* Colored Banner */}
              <div className="dev-card-banner" style={{ background: dev.container }}>
                <div className="dev-avatar-wrapper">
                  <img
                    src={dev.image}
                    alt={dev.name}
                    className="dev-avatar-img"
                  />
                </div>
              </div>

              {/* Info */}
              <div className="dev-info-container">
                <h3 className="serif-heading dev-name">
                  {dev.name}
                </h3>
                <span
                  className="dev-role-badge"
                  style={{
                    background: dev.container,
                    color: dev.onContainer,
                  }}
                >
                  <GraduationCap size={12} /> {dev.role}
                </span>
                <p className="text-body-medium dev-bio">
                  {dev.text}
                </p>

                {/* Social */}
                <div className="flex-row-gap-10">
                  {[
                    { href: dev.github, icon: Github, label: "Github" },
                    { href: dev.linkedin, icon: Linkedin, label: "LinkedIn" },
                    { href: "mailto:support@examrepository.com", icon: Mail, label: "Email" },
                  ].map(({ href, icon, label }) => {
                    const DevIcon = icon;
                    return (
                      <a
                        key={label}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={label}
                        className="social-icon-link"
                      >
                        <DevIcon size={16} />
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
