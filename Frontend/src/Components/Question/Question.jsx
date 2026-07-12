import React, { useState, useEffect, useContext } from "react";
import AuthContext from "../../Context/AuthContext";
import { ConfigContext } from "../../Context/ConfigContext";
import { useToast } from "../Toast/ToastContext";
import { useConfirm } from "../ConfirmModal/ConfirmContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "./Question.css";
import { useParams, useNavigate } from "react-router-dom";
import coinIcon from "../../Assets/coin.svg";
import { Calendar, ArrowLeft, Search, GraduationCap } from "lucide-react";
import {
  getPapers,
  getPaperDetails,
  getCourses,
  updateBrowsedCourse,
  unlockAnswer,
  API_BASE
} from "../../services/api";

export default function QuestionList() {
  const auth = useContext(AuthContext);
  const { unlockCost } = useContext(ConfigContext);
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { id } = useParams();
  const [papers, setPapers] = useState([]);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (id) {
      // Fetch a single paper by ID
      getPaperDetails(id, auth.token)
        .then((data) => {
          if (data && data.paper) {
            const populatedPaper = {
              ...data.paper,
              filePath: data.paper.file_path || data.paper.filePath,
              course: data.course,
              questions: (data.questions || []).map(q => ({
                ...q,
                _id: q._id || q.id,
                question: q.question_text || q.question,
                answer: q.answer_text || q.answer,
              })),
            };
            setSelectedPaper(populatedPaper);
          }
        })
        .catch((error) => console.error("Error fetching paper:", error));
    } else {
      // Fetch all papers and courses for the list view
      Promise.all([getPapers(), getCourses()])
        .then(([papersResp, coursesData]) => {
          const populated = (papersResp.papers || []).map((paper) => {
            const course = (coursesData || []).find(
              (c) => c._id === paper.course_id || c.id === paper.course_id
            );
            return {
              ...paper,
              filePath: paper.file_path || paper.filePath,
              course: course || null,
            };
          });
          setPapers(populated);
        })
        .catch((error) => console.error("Error fetching papers:", error));
    }
  }, [id, auth.token]);

  const handlePaperClick = async (paper) => {
    try {
      const data = await getPaperDetails(paper._id, auth.token);
      if (data && data.paper) {
        const populatedPaper = {
          ...data.paper,
          filePath: data.paper.file_path || data.paper.filePath,
          course: data.course,
          questions: (data.questions || []).map(q => ({
            ...q,
            _id: q._id || q.id,
            question: q.question_text || q.question,
            answer: q.answer_text || q.answer,
          })),
        };
        setSelectedPaper(populatedPaper);
      }

      // Update browsed courses for the user by calling the update endpoint
      if (paper.course_id || (paper.course && (paper.course._id || paper.course.id))) {
        const courseId = paper.course_id || paper.course._id || paper.course.id;
        updateBrowsedCourse(courseId, auth.token)
          .then((data) => console.log("User browsed courses updated:", data))
          .catch((error) => console.error("Error updating browsed courses:", error));
      }
    } catch (error) {
      console.error("Error loading paper details:", error);
    }
  };

  const handleClose = () => {
    setSelectedPaper(null);
  };

  const handleUnlock = async (qId) => {
    if (unlockCost === null) return;

    if ((auth.credit || 0) < unlockCost) {
      toast.error("Not enough credits to unlock!");
      navigate("/subscription");
      return;
    }

    const isConfirmed = await confirm({
      title: "Unlock Answer",
      message: `Are you sure you want to unlock this answer for ${unlockCost} credits?`,
      confirmText: "Unlock",
      cancelText: "Cancel",
    });
    if (!isConfirmed) return;

    try {
      const data = await unlockAnswer(qId, auth.token);

      // Deduct credits in the Auth context
      auth.updateCredit(data.credit);
      toast.success("Answer unlocked!");

      // Refetch paper details to get the unlocked answer text
      const updatedData = await getPaperDetails(selectedPaper._id, auth.token);
      if (updatedData && updatedData.paper) {
        const populatedPaper = {
          ...updatedData.paper,
          filePath: updatedData.paper.file_path || updatedData.paper.filePath,
          course: updatedData.course,
          questions: (updatedData.questions || []).map(q => ({
            ...q,
            _id: q._id || q.id,
            question: q.question_text || q.question,
            answer: q.answer_text || q.answer,
          })),
        };
        setSelectedPaper(populatedPaper);
      }
    } catch (error) {
      toast.error(error.message || "Failed to unlock answer");
    }
  };

  const filteredPapers = papers.filter((paper) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    const courseCode = paper.course?.code?.toLowerCase() || "";
    const courseName = paper.course?.name?.toLowerCase() || "";
    const tags = (paper.questions || [])
      .map((q) => q.tag?.toLowerCase() || "")
      .join(" ");
    return (
      courseCode.includes(query) ||
      courseName.includes(query) ||
      tags.includes(query)
    );
  });

  return (
    <div style={{ minHeight: "100vh", paddingTop: "var(--navbar-height)", background: "var(--md-background)" }} className="dot-pattern-bg">
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 120px" }}>

        {!selectedPaper ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 16, height: 2, background: "var(--md-secondary)" }} />
              <span className="serif-heading" style={{ fontSize: "1.0625rem", color: "var(--md-secondary)", fontWeight: 500 }}>
                Archive Library
              </span>
            </div>

            <h2 className="text-display-small serif-heading" style={{ color: "var(--md-primary)", marginBottom: 28, fontWeight: 500 }}>
              Uploaded Papers
            </h2>

            {/* Search Input */}
            <div className="relative mb-8" style={{ maxWidth: 600 }}>
              <input
                type="text"
                placeholder="Search by course code, name, or tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field"
                style={{
                  paddingLeft: 48,
                  borderRadius: "var(--shape-full)",
                }}
              />
              <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" style={{ display: "flex", alignItems: "center" }}>
                <Search size={18} style={{ color: "var(--md-outline)" }} />
              </span>
            </div>

            {/* Grid layout for paper list */}
            {filteredPapers.length === 0 ? (
              <div className="card-outlined" style={{ padding: 48, textAlign: "center", background: "var(--md-surface)" }}>
                <GraduationCap size={44} style={{ color: "var(--md-outline)", margin: "0 auto 16px", opacity: 0.6 }} />
                <p style={{ color: "var(--md-on-surface-variant)", fontSize: "1rem", margin: 0 }}>
                  No papers matching your search query were found.
                </p>
              </div>
            ) : (
              <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20, padding: 0, margin: 0 }}>
                {filteredPapers.map((paper) => (
                  <li
                    key={paper._id}
                    className="card-elevated"
                    style={{ padding: 24, cursor: "pointer", background: "var(--md-surface)", listStyle: "none", display: "flex", flexDirection: "column", justifyContent: "space-between" }}
                    onClick={() => handlePaperClick(paper)}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <span className="serif-heading" style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--md-primary)" }}>
                          {paper.course ? `[${paper.course.code}]` : "[N/A]"}
                        </span>
                        <span className="badge badge-secondary" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                          {paper.examType || paper.exam_type}
                        </span>
                      </div>
                      <h4 style={{ fontSize: "1rem", fontWeight: 500, color: "var(--md-on-surface)", margin: "0 0 16px 0", lineHeight: 1.4 }}>
                        {paper.course ? paper.course.name : "Unknown Course"}
                      </h4>
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--md-outline-variant)", paddingTop: 16, marginTop: 8 }}>
                        <p style={{ fontSize: "0.8125rem", color: "var(--md-on-surface-variant)", margin: 0, display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                          <Calendar size={14} />
                          {paper.session} {paper.sessionYear || paper.session_year}
                        </p>
                        <span style={{ fontSize: "0.75rem", color: "var(--md-outline)", fontWeight: 500 }}>
                          {new Date(paper.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                      {paper.questions && paper.questions.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                          {paper.questions.map((q, idx) =>
                            q.tag ? (
                              <span
                                key={idx}
                                className="badge"
                                style={{ fontSize: "0.65rem", background: "var(--md-surface-container-high)", color: "var(--md-on-surface-variant)", border: "none" }}
                              >
                                {q.tag}
                              </span>
                            ) : null
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div>
            {/* Back Button and Title */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
              <button
                className="btn-outlined"
                onClick={handleClose}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px" }}
              >
                <ArrowLeft size={16} /> Back
              </button>
              <h2 className="text-headline-medium serif-heading" style={{ color: "var(--md-primary)", margin: 0, fontWeight: 500 }}>
                {selectedPaper.title}
              </h2>
            </div>

            {/* Split View */}
            <div style={{ display: "grid", gap: 32, gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))" }}>

              {/* Left Column: Paper File Preview */}
              <div className="card-outlined" style={{ padding: 20, background: "var(--md-surface)", height: "fit-content" }}>
                <h3 className="serif-heading" style={{ fontSize: "1.25rem", color: "var(--md-primary)", marginTop: 0, marginBottom: 16, fontWeight: 500 }}>
                  Document Preview
                </h3>
                {selectedPaper.filePath?.toLowerCase().split('?')[0].endsWith('.pdf') ? (
                  <iframe
                    src={selectedPaper.filePath.startsWith("http") ? `${selectedPaper.filePath}#view=FitH` : `${API_BASE}${selectedPaper.filePath}#view=FitH`}
                    title="Paper Preview"
                    style={{ width: "100%", height: "70vh", border: "1px solid var(--md-outline-variant)" }}
                  ></iframe>
                ) : (
                  <img
                    src={selectedPaper.filePath.startsWith("http") ? selectedPaper.filePath : `${API_BASE}${selectedPaper.filePath}`}
                    alt="Question Paper"
                    style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", border: "1px solid var(--md-outline-variant)", borderRadius: "var(--shape-md)" }}
                  />
                )}
              </div>

              {/* Right Column: Questions and Answers */}
              <div className="card-outlined" style={{ padding: 20, background: "var(--md-surface)", height: "fit-content" }}>
                <h3 className="serif-heading" style={{ fontSize: "1.25rem", color: "var(--md-primary)", marginTop: 0, marginBottom: 16, fontWeight: 500 }}>
                  Questions & Solutions
                </h3>
                <ul style={{ display: "flex", flexDirection: "column", gap: 20, padding: 0, margin: 0 }}>
                  {selectedPaper.questions.map((qa, index) => (
                    <li
                      key={index}
                      className="card-filled"
                      style={{ padding: 20, listStyle: "none" }}
                    >
                      <h4 className="serif-heading" style={{ fontSize: "1.0625rem", color: "var(--md-primary)", marginTop: 0, marginBottom: 12, fontWeight: 500, lineHeight: 1.4 }}>
                        Q{index + 1}: {qa.question}
                      </h4>
                      <hr style={{ border: "none", borderTop: "1px solid var(--md-outline-variant)", marginBottom: 16 }} />

                      <div style={{ color: "var(--md-on-surface)" }}>
                        {qa.answer ? (
                          <div className="markdown-body" style={{ fontSize: "0.9375rem", lineHeight: 1.6 }}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                math: ({ node: _node, ...props }) => (
                                  <div className="w-full my-4 flex justify-center overflow-x-auto">
                                    <span {...props} />
                                  </div>
                                ),
                                inlineMath: ({ node: _node, ...props }) => <span {...props} />,
                              }}
                            >
                              {qa.answer}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div>
                            <p style={{ fontSize: "0.875rem", color: "var(--md-on-surface-variant)", marginBottom: 16, margin: "0 0 12px 0" }}>
                              Solution for this question is currently locked.
                            </p>
                            <button
                              className="btn-filled"
                              onClick={() => handleUnlock(index)}
                              disabled={unlockCost === null}
                              style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", textTransform: "none" }}
                            >
                              <span>Unlock Solution</span>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.15)", padding: "2px 8px", borderRadius: 12, fontSize: "0.75rem", fontWeight: 700 }}>
                                {unlockCost || "..."} <img src={coinIcon} className="w-auto h-4" alt="coins" />
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

                      {qa.tag && (
                        <div style={{ marginTop: 16, display: "flex" }}>
                          <span className="badge" style={{ fontSize: "0.65rem", background: "var(--md-surface-container-highest)", border: "none" }}>
                            Tag: {qa.tag}
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};


