import React, { useState, useEffect, useContext, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Search, FileText, Clock, Tag, ChevronRight, Sparkles, X } from "lucide-react";
import AuthContext from "../../Context/AuthContext";
import { getPapers, getPaperFilters, updateBrowsedCourse } from "../../services/api";
import FullPageSpinner from "../UI/FullPageSpinner";
import PageHeader from "../UI/PageHeader";

function CustomDropdown({ label, options, selected, onChange, searchable = false, placeholder = "Search..." }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchVal, setSearchVal] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => {
    if (!searchable || !searchVal) return true;
    const labelText = typeof opt === "string" ? opt : `${opt.code || ""} ${opt.name || ""}`;
    return labelText.toLowerCase().includes(searchVal.toLowerCase());
  });

  const selectedLabel = typeof selected === "string"
    ? selected
    : selected
      ? `${selected.code || ""} - ${selected.name || ""}`
      : `All ${label}s`;

  return (
    <div className="custom-dropdown-container" ref={dropdownRef}>
      <button
        type="button"
        className={`custom-dropdown-trigger ${selected ? "active-filter" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{selectedLabel}</span>
        <span style={{ fontSize: "10px", marginLeft: "8px", opacity: 0.6 }}>▼</span>
      </button>

      {isOpen && (
        <div className="custom-dropdown-menu">
          {searchable && (
            <div className="custom-dropdown-search-wrapper">
              <input
                type="text"
                placeholder={placeholder}
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                className="input-field custom-dropdown-search"
                autoFocus
              />
            </div>
          )}
          <div className="custom-dropdown-options">
            <button
              type="button"
              className={`custom-dropdown-option ${!selected ? "active" : ""}`}
              onClick={() => {
                onChange(null);
                setIsOpen(false);
                setSearchVal("");
              }}
            >
              All {label}s
            </button>
            {filteredOptions.map((opt, index) => {
              const optId = typeof opt === "string" ? opt : opt.id;
              const optLabel = typeof opt === "string" ? opt : `${opt.code} - ${opt.name}`;
              const isSelected = typeof selected === "string" ? selected === opt : selected?.id === opt.id;

              return (
                <button
                  key={optId || index}
                  type="button"
                  className={`custom-dropdown-option ${isSelected ? "active" : ""}`}
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                    setSearchVal("");
                  }}
                >
                  {optLabel}
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div style={{ padding: "10px 14px", fontSize: "13px", color: "var(--md-on-surface-variant)", opacity: 0.7 }}>
                No options found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PapersList() {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  
  const [papers, setPapers] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState(location.state?.search || "");
  const [debouncedSearch, setDebouncedSearch] = useState(location.state?.search || "");
  const [initialLoad, setInitialLoad] = useState(true);
  const [isFetching, setIsFetching] = useState(false);

  // Filters State
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedExamType, setSelectedExamType] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);

  const [filterOptions, setFilterOptions] = useState({
    courses: [],
    exam_types: [],
    session_years: []
  });

  const hasActiveFilters = selectedCourse || selectedExamType || selectedYear;

  const clearFilters = () => {
    setSelectedCourse(null);
    setSelectedExamType(null);
    setSelectedYear(null);
  };

  // Fetch filter choices once on load
  useEffect(() => {
    getPaperFilters()
      .then((data) => {
        setFilterOptions(data);
      })
      .catch(() => {});
  }, []);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch papers when search or filters change
  useEffect(() => {
    setIsFetching(true);
    getPapers({
      q: debouncedSearch,
      exam_type: selectedExamType || "",
      session_year: selectedYear || "",
      course_id: selectedCourse?.id || "",
    })
      .then((data) => {
        setPapers(data.papers || []);
        setCursor(data.next_cursor || null);
        setHasMore(!!data.next_cursor);
      })
      .catch(() => setPapers([]))
      .finally(() => {
        setIsFetching(false);
        setInitialLoad(false);
      });
  }, [debouncedSearch, selectedExamType, selectedYear, selectedCourse]);

  const loadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    getPapers({
      q: debouncedSearch,
      exam_type: selectedExamType || "",
      session_year: selectedYear || "",
      course_id: selectedCourse?.id || "",
      cursor: cursor
    })
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

  if (initialLoad) {
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

        {/* Search Input */}
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
            placeholder="Search paper titles or topics (e.g., 'Operating Systems', 'Recursion')..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field search-input-field"
          />
          {search && (
            <X 
              size={18} 
              className="search-clear-overlay" 
              onClick={() => setSearch("")} 
            />
          )}
        </motion.div>

        {/* Filter dropdowns */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="filter-row"
        >
          <CustomDropdown
            label="Course"
            options={filterOptions.courses}
            selected={selectedCourse}
            onChange={setSelectedCourse}
            searchable={true}
            placeholder="Filter courses..."
          />
          <CustomDropdown
            label="Exam Type"
            options={filterOptions.exam_types}
            selected={selectedExamType}
            onChange={setSelectedExamType}
          />
          <CustomDropdown
            label="Year"
            options={filterOptions.session_years}
            selected={selectedYear}
            onChange={setSelectedYear}
          />
          {hasActiveFilters && (
            <button 
              type="button"
              className="btn-text" 
              onClick={clearFilters}
              style={{ marginLeft: "auto", height: "42px", fontSize: "13px" }}
            >
              Clear Filters
            </button>
          )}
        </motion.div>

        {/* Loading Indicator for Refetches */}
        {isFetching && !initialLoad && (
          <div className="search-loading-bar">
            <div className="search-loading-bar-inner"></div>
          </div>
        )}

        {/* Papers List */}
        {papers.length === 0 ? (
          <div className="card-elevated empty-state-card">
            <FileText size={44} className="questions-empty-icon" />
            <p className="text-body-large no-margin">
              {search || selectedCourse || selectedExamType || selectedYear
                ? "No papers match your filters."
                : "No papers uploaded yet."}
            </p>
          </div>
        ) : (
          <div className="vertical-stack-16 stagger-children">
            {papers.map((paper) => (
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

                    {/* Matched Questions Submenu */}
                    {paper.matched_questions && paper.matched_questions.length > 0 && (
                      <div className="paper-matched-questions" onClick={(e) => e.stopPropagation()}>
                        <div className="matched-questions-header">
                          <Sparkles size={12} style={{ color: "var(--md-secondary)" }} />
                          <span>Matching Questions ({paper.matched_questions.length})</span>
                        </div>
                        <div className="matched-questions-list">
                          {paper.matched_questions.map((q) => (
                            <div
                              key={q._id || Math.random()}
                              className="matched-question-item"
                              onClick={() => navigate(`/paper/${paper._id}#q-${q._id}`)}
                            >
                              <span className="matched-question-tag">
                                <Tag size={10} />
                                {q.tag || "General"}
                              </span>
                              <p 
                                className="no-margin" 
                                style={{ 
                                  fontSize: "14px", 
                                  opacity: 0.9,
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis"
                                }}
                              >
                                {q.question_text}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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


