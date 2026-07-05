import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Search, FileText, Clock, Tag, ChevronRight } from "lucide-react";
import AuthContext from "../../Context/AuthContext";
import { getPapers, updateBrowsedCourse } from "../../services/api";
import FullPageSpinner from "../UI/FullPageSpinner";
import PageHeader from "../UI/PageHeader";

export default function PapersList() {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();
  const [papers, setPapers] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPapers()
      .then((data) => {
        setPapers(data.papers || []);
        setCursor(data.next_cursor || null);
        setHasMore(!!data.next_cursor);
      })
      .catch(() => setPapers([]))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    getPapers(cursor)
      .then((data) => {
        setPapers((prev) => [...prev, ...(data.papers || [])]);
        setCursor(data.next_cursor || null);
        setHasMore(!!data.next_cursor);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  const handlePaperClick = (paper) => {
    if (auth.token && paper.course_id) {
      updateBrowsedCourse(paper.course_id, auth.token).catch(() => {});
    }
    navigate(`/paper/${paper._id}`);
  };

  const filteredPapers = papers.filter((paper) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    const title = paper.title?.toLowerCase() || "";
    const examType = paper.exam_type?.toLowerCase() || "";
    const session = `${paper.session} ${paper.session_year}`.toLowerCase();
    return title.includes(query) || examType.includes(query) || session.includes(query);
  });

  if (loading) {
    return <FullPageSpinner />;
  }

  return (
    <div className="page-wrapper with-navbar dot-pattern-bg">
      <div className="page-content">
        {/* Header */}
        <PageHeader
          label="Vault Catalog"
          title="Exam Papers"
          description="Browse verified past exams and unlock step-by-step AI answers."
        />

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="search-container"
        >
          <Search
            size={18}
            className="search-icon-overlay"
          />
          <input
            id="papers-search"
            type="text"
            placeholder="Search by title, exam type, or session…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field search-input-field"
          />
        </motion.div>

        {/* Papers */}
        {filteredPapers.length === 0 ? (
          <div className="card-elevated empty-state-card">
            <FileText size={44} className="questions-empty-icon" />
            <p className="text-body-large no-margin">
              {search ? "No papers match your search." : "No papers uploaded yet."}
            </p>
          </div>
        ) : (
          <div className="vertical-stack-16 stagger-children">
            {filteredPapers.map((paper) => (
              <div
                key={paper._id}
                className="card-elevated card-item-clickable"
                onClick={() => handlePaperClick(paper)}
              >
                <div className="flex-row-between">
                  <div className="flex-1-min-w-0">
                    <h3 className="text-headline-small serif-heading paper-card-title">
                      {paper.title || "Untitled Paper"}
                    </h3>
                    <div className="badge-row-mb12">
                      <span className="badge badge-primary">
                        {paper.session} {paper.session_year}
                      </span>
                      <span className="badge">
                        <Tag size={10} className="mr-4" />
                        {paper.exam_type}
                      </span>
                    </div>
                    <div className="text-body-small card-footer-info">
                      <Clock size={14} />
                      {new Date(paper.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <ChevronRight size={18} className="chevron-arrow" />
                </div>
              </div>
            ))}
            
            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
                <button
                  className="btn-outlined"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


