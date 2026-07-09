import React, { useState, useEffect, useContext, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, Lock, Unlock, Tag, HelpCircle, Wallet,
  ChevronDown, ChevronUp, AlertCircle, ExternalLink
} from "lucide-react";
import AuthContext from "../../Context/AuthContext";
import { ConfigContext } from "../../Context/ConfigContext";
import { getPaperDetails, unlockAnswer, API_BASE } from "../../services/api";
import { useToast } from "../Toast/ToastContext";
import { useConfirm } from "../ConfirmModal/ConfirmContext";
import coinIcon from "../../Assets/coin.svg";
import FullPageSpinner from "../UI/FullPageSpinner";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const QuestionCard = React.memo(({ q, index, handleUnlock }) => {
  const { unlockCost } = useContext(ConfigContext);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isQuestionExpanded, setIsQuestionExpanded] = useState(false);
  
  const isUnlocked = q.answer_text !== null;

  const onUnlockClick = async () => {
    const success = await handleUnlock(q._id);
    if (success) {
      setIsExpanded(true);
    }
  };

  return (
    <div className="card-outlined question-card" id={`q-${q._id}`}>
      <div className="question-card-header">
        <span className="badge badge-primary question-index-badge">
          Q{index + 1}
        </span>
        {q.tag && (
          <span className="badge">
            <Tag size={10} className="tag-icon" /> {q.tag}
          </span>
        )}
      </div>

      <div
        onClick={() => setIsQuestionExpanded(!isQuestionExpanded)}
        className={`question-text-wrapper ${!isQuestionExpanded ? "question-text-clamped" : ""}`}
        title={isQuestionExpanded ? "Click to collapse question" : "Click to expand question"}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
          {q.question_text || ""}
        </ReactMarkdown>
      </div>

      {!isUnlocked ? (
        <div className="solution-locked-box">
          <div className="locked-status-wrap">
            <Lock size={16} />
            <span className="text-title-small locked-label">Solution locked</span>
          </div>
          <button
            className="btn-filled unlock-btn"
            onClick={onUnlockClick}
            disabled={unlockCost === null}
          >
            <img src={coinIcon} alt="" className="coin-icon" />
            Unlock for {unlockCost || "..."} Credits
          </button>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="solution-unlocked-btn"
          >
            <div className="unlocked-label-wrap">
              <Unlock size={16} /> Solution Unlocked
            </div>
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="answer-motion-wrapper"
              >
                <div className="answer-text-box">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {(!q.answer_text || q.answer_text.trim() === "") ? "*Answer currently not available.*" : q.answer_text}
                  </ReactMarkdown>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
});


export default function PaperDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useContext(AuthContext);
  const { unlockCost } = useContext(ConfigContext);
  const toast = useToast();
  const confirm = useConfirm();

  const [paper, setPaper] = useState(null);
  const [course, setCourse] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("questions");

  const fetchDetails = useCallback(async () => {
    try {
      const data = await getPaperDetails(id, auth.token);
      setPaper(data.paper);
      setCourse(data.course);
      setQuestions(data.questions || []);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load paper details");
      toast.error(err.message || "Failed to load paper details");
    } finally {
      setLoading(false);
    }
  }, [id, auth.token, toast]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Handle Hash Scrolling
  useEffect(() => {
    if (!loading && questions.length > 0 && location.hash) {
      const hashId = location.hash.substring(1); // removes the '#'
      setTimeout(() => {
        const element = document.getElementById(hashId);
        const container = document.querySelector('.detail-questions-list');
        if (element && container) {
          const containerTop = container.getBoundingClientRect().top;
          const elementTop = element.getBoundingClientRect().top;
          const offset = elementTop - containerTop + container.scrollTop;
          
          container.scrollTo({ top: offset - 20, behavior: "smooth" });
          
          element.classList.add("highlight-flash");
          setTimeout(() => element.classList.remove("highlight-flash"), 2500);
        }
      }, 200); // Wait briefly for react to paint the DOM
    }
  }, [loading, questions.length, location.hash]);

  const handleUnlock = useCallback(async (questionId) => {
    if (unlockCost === null) return false;
    
    const isConfirmed = await confirm({
      title: "Unlock Answer",
      message: `This will use ${unlockCost} credits to unlock the solution. Continue?`,
      confirmText: "Unlock",
      cancelText: "Cancel",
    });
    if (!isConfirmed) return false;

    if ((auth.credit ?? 0) < unlockCost) {
      toast.error("Not enough credits. Top up your balance.");
      navigate("/subscription");
      return false;
    }

    try {
      const response = await unlockAnswer(questionId, auth.token);
      auth.updateCredit(response.credit);
      toast.success("Answer unlocked!");
      await fetchDetails();
      return true;
    } catch (err) {
      toast.error(err.message || "Failed to unlock answer");
      return false;
    }
  }, [confirm, auth, navigate, toast, fetchDetails]);

  if (loading) {
    return <FullPageSpinner />;
  }

  if (error || !paper) {
    return (
      <div className="detail-error-wrapper dot-pattern-bg">
        <div className="card-elevated animate-scale-in detail-error-card">
          <AlertCircle size={44} className="detail-error-icon" />
          <h2 className="text-headline-small serif-heading detail-error-heading">Failed to Load Paper</h2>
          <p className="text-body-medium detail-error-text">
            {error || "This paper doesn't exist or has been removed."}
          </p>
          <button className="btn-filled" onClick={() => navigate("/papers")}>
            <ArrowLeft size={16} /> Back to Papers
          </button>
        </div>
      </div>
    );
  }

  const isPdf = paper.file_path?.toLowerCase().split('?')[0].endsWith(".pdf");
  let fileUrl = "";
  if (paper.file_path) {
    if (/^https?:\/\//i.test(paper.file_path)) {
      try {
        fileUrl = new URL(paper.file_path).href;
      } catch (e) {
        fileUrl = "";
      }
    } else if (!/^[a-z]+:/i.test(paper.file_path)) {
      const cleanPath = paper.file_path.startsWith("/") ? paper.file_path.slice(1) : paper.file_path;
      const base = API_BASE.endsWith("/") ? API_BASE : `${API_BASE}/`;
      fileUrl = `${base}${cleanPath}`;
    }
  }

  return (
    <div className="detail-page-wrapper">
      {/* Header Bar */}
      <div className="detail-header-bar">
        <div className="detail-header-content">
          <div className="detail-header-left">
            <button
              onClick={() => navigate("/papers")}
              className="icon-btn-outlined"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-headline-small serif-heading detail-header-title">
                {paper.title || "Untitled Paper"}
              </h1>
              {course && (
                <p className="text-body-small detail-header-subtext">
                  {course.code} &bull; {course.name}
                </p>
              )}
            </div>
          </div>
          <div className="detail-header-right">
            <span className="badge">{paper.exam_type}</span>
            <span className="badge badge-primary">{paper.session} {paper.session_year}</span>
          </div>
        </div>
      </div>

      {/* Mobile Tabs */}
      <div className="flex md:hidden detail-mobile-tabs">
        {["paper", "questions"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="detail-mobile-tab-btn"
            style={{
              color: activeTab === tab ? "var(--md-primary)" : "var(--md-on-surface-variant)",
              borderBottom: activeTab === tab ? "3px solid var(--md-primary)" : "3px solid transparent",
            }}
          >
            {tab === "paper" ? "Paper View" : `Solutions (${questions.length})`}
          </button>
        ))}
      </div>

      {/* Two-Panel Layout */}
      <div className="detail-panels-container flex-col md:flex-row">
        {/* Left — Paper */}
        <div className={`${activeTab === "paper" ? "flex" : "hidden"} md:flex detail-left-panel`}>
          <div className="detail-panel-toolbar">
            <span className="text-label-medium detail-toolbar-label">
              Reference Document
            </span>
            <a
              href={fileUrl} target="_blank" rel="noopener noreferrer"
              className="btn-outlined detail-external-btn"
            >
              Open <ExternalLink size={12} />
            </a>
          </div>
          <div className="detail-iframe-container">
            {isPdf ? (
              <iframe src={`${fileUrl}#toolbar=0&view=FitH`} className="detail-iframe" title="PDF Viewer" />
            ) : (
              <div className="detail-image-container">
                <img src={fileUrl} alt="Paper" className="detail-image" />
              </div>
            )}
          </div>
        </div>

        {/* Right — Questions */}
        <div className={`${activeTab === "questions" ? "flex" : "hidden"} md:flex detail-right-panel`}>
          <div className="detail-questions-toolbar">
            <h2 className="text-title-large serif-heading detail-panel-title">
              Solutions
            </h2>
            <span className="badge questions-count-badge">
              {questions.length} Question{questions.length !== 1 && "s"}
            </span>
          </div>

          <div className="detail-questions-list stagger-children">
            {questions.length === 0 ? (
              <div className="detail-questions-empty">
                <HelpCircle size={40} className="detail-questions-empty-icon" />
                <p className="text-body-medium">
                  No questions parsed for this paper yet.
                </p>
              </div>
            ) : (
              questions.map((q, index) => (
                <QuestionCard key={q._id} q={q} index={index} handleUnlock={handleUnlock} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


