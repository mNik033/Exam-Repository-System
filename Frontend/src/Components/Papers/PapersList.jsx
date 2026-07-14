import React, { useState, useEffect, useContext, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, FileText, Clock, Tag, ChevronRight, Sparkles, X,
  SlidersHorizontal, ChevronDown, RotateCcw
} from "lucide-react";
import AuthContext from "../../Context/AuthContext";
import { getPapers, getPaperFilters, updateBrowsedCourse } from "../../services/api";
import FullPageSpinner from "../UI/FullPageSpinner";
import PageHeader from "../UI/PageHeader";

/* ─── Filter Sidebar Section (radio group) ─── */
function FilterSection({ title, options, selected, onChange, renderLabel, searchable = false, allLabel }) {
  const [searchVal, setSearchVal] = useState("");

  const filteredOptions = options.filter((opt) => {
    if (!searchable || !searchVal) return true;
    const label = renderLabel ? renderLabel(opt) : String(opt);
    return label.toLowerCase().includes(searchVal.toLowerCase());
  });

  return (
    <div className="filter-section">
      <h4 className="filter-section-title">{title}</h4>

      {searchable && options.length > 6 && (
        <div className="filter-search-wrap">
          <Search size={13} className="filter-search-icon" />
          <input
            type="text"
            placeholder={`Search ${title.toLowerCase()}...`}
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            className="filter-search-input"
          />
        </div>
      )}

      <div className="filter-options-list">
        {/* "All" option */}
        <label className={`filter-radio-label ${!selected ? "active" : ""}`}>
          <input
            type="radio"
            name={title}
            checked={!selected}
            onChange={() => onChange(null)}
            className="filter-radio-input"
          />
          <span className="filter-radio-dot" />
          <span className="filter-radio-text">{allLabel || `All ${title}`}</span>
        </label>

        {filteredOptions.map((opt, idx) => {
          const optId = typeof opt === "string" ? opt : opt.id;
          const label = renderLabel ? renderLabel(opt) : String(opt);
          const isSelected = selected !== null && (
            typeof selected === "string"
              ? selected === opt
              : selected?.id === opt?.id
          );

          return (
            <label key={optId || idx} className={`filter-radio-label ${isSelected ? "active" : ""}`}>
              <input
                type="radio"
                name={title}
                checked={isSelected}
                onChange={() => onChange(opt)}
                className="filter-radio-input"
              />
              <span className="filter-radio-dot" />
              <span className="filter-radio-text">{label}</span>
            </label>
          );
        })}

        {filteredOptions.length === 0 && (
          <p className="filter-no-results">No matches</p>
        )}
      </div>
    </div>
  );
}


export default function PapersList() {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const papersListRef = useRef(null);
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

  // Mobile drawer
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const hasActiveFilters = selectedCourse || selectedExamType || selectedYear;
  const activeFilterCount =
    (selectedCourse ? 1 : 0) +
    (selectedExamType ? 1 : 0) +
    (selectedYear ? 1 : 0);

  const clearFilters = () => {
    setSelectedCourse(null);
    setSelectedExamType(null);
    setSelectedYear(null);
  };

  // Fetch filter choices once on load
  useEffect(() => {
    getPaperFilters()
      .then((data) => {
        if (data.session_years) {
          data.session_years.sort((a, b) => b.localeCompare(a));
        }
        setFilterOptions(data);
      })
      .catch(() => { });
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
        
        // Scroll to top of results only after fetching new data (skip on initial mount)
        if (!initialLoad && papersListRef.current) {
          papersListRef.current.scrollIntoView({ behavior: "smooth" });
        }
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
      .catch(() => { })
      .finally(() => setLoadingMore(false));
  };

  const handlePaperClick = (paper) => {
    if (auth.token && paper.course_id) {
      updateBrowsedCourse(paper.course_id, auth.token).catch(() => { });
    }
    navigate(`/paper/${paper._id}`);
  };

  if (initialLoad) {
    return <FullPageSpinner />;
  }

  /* ─── Filter Sidebar Content (shared desktop + mobile) ─── */
  const filterContent = (
    <>
      {/* Active filters summary */}
      {hasActiveFilters && (
        <div className="active-filters-summary">
          <div className="active-filters-chips">
            {selectedCourse && (
              <span className="active-filter-chip" onClick={() => setSelectedCourse(null)}>
                {selectedCourse.code} <X size={12} />
              </span>
            )}
            {selectedExamType && (
              <span className="active-filter-chip" onClick={() => setSelectedExamType(null)}>
                {selectedExamType} <X size={12} />
              </span>
            )}
            {selectedYear && (
              <span className="active-filter-chip" onClick={() => setSelectedYear(null)}>
                {selectedYear} <X size={12} />
              </span>
            )}
          </div>
          <button type="button" className="filter-clear-btn" onClick={clearFilters}>
            <RotateCcw size={13} /> Reset
          </button>
        </div>
      )}

      <FilterSection
        title="Courses"
        options={filterOptions.courses}
        selected={selectedCourse}
        onChange={setSelectedCourse}
        searchable={true}
        renderLabel={(c) => `${c.code} — ${c.name}`}
        allLabel="All Courses"
      />

      <FilterSection
        title="Exam Type"
        options={filterOptions.exam_types}
        selected={selectedExamType}
        onChange={setSelectedExamType}
        renderLabel={(t) => t}
        allLabel="All Exam Types"
      />

      <FilterSection
        title="Session Year"
        options={filterOptions.session_years}
        selected={selectedYear}
        onChange={setSelectedYear}
        renderLabel={(y) => y}
        allLabel="All Session Years"
      />
    </>
  );

  return (
    <div className="page-wrapper with-navbar dot-pattern-bg">
      <div className="page-content">
        {/* Header */}
        <PageHeader
          label="Vault Catalog"
          title="Exam Papers"
          description="Browse verified past exams and unlock step-by-step AI answers."
        />

        {/* Sticky Search Bar */}
        <div className="search-bar-sticky">
          <div className="search-bar-inner">
            <div className={`search-field-wrap ${isFetching && !initialLoad ? 'is-loading' : ''}`}>
              <Search size={18} className="search-icon-overlay" />
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
            </div>

            {/* Mobile filter toggle */}
            <button
              type="button"
              className="mobile-filter-toggle"
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            >
              <SlidersHorizontal size={18} />
              {activeFilterCount > 0 && (
                <span className="filter-count-badge">{activeFilterCount}</span>
              )}
            </button>
          </div>

        </div>

        {/* ─── Main Layout: Sidebar + Results ─── */}
        <div ref={papersListRef} className="sidebar-layout">

          {/* Desktop Sidebar */}
          <aside className="filter-sidebar">
            <div className="sidebar-header">
              <SlidersHorizontal size={16} />
              <span>Filters</span>
            </div>
            <div className="sidebar-body">
              {filterContent}
            </div>
          </aside>

          {/* Mobile Filter Drawer */}
          <AnimatePresence>
            {mobileFiltersOpen && (
              <>
                <motion.div
                  className="mobile-filter-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setMobileFiltersOpen(false)}
                />
                <motion.div
                  className="mobile-filter-drawer"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 300 }}
                >
                  <div className="mobile-drawer-header">
                    <div className="mobile-drawer-handle" />
                    <div className="mobile-drawer-title-row">
                      <h3>Filters</h3>
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => setMobileFiltersOpen(false)}
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                  <div className="mobile-drawer-body">
                    {filterContent}
                  </div>
                  <div className="mobile-drawer-footer">
                    <button
                      type="button"
                      className="btn-filled"
                      onClick={() => setMobileFiltersOpen(false)}
                      style={{ width: "100%" }}
                    >
                      Show Results
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* ─── Results Column ─── */}
          <main className="sidebar-main">
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
          </main>
        </div>
      </div>
    </div>
  );
}
