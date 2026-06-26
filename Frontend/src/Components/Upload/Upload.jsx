import React, { useState, useContext, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { UploadCloud, FileText, X, CheckCircle, Sparkles, ArrowRight, Loader } from "lucide-react";
import AuthContext from "../../Context/AuthContext";
import { uploadPaper, getMyPapers } from "../../services/api";
import { useToast } from "../Toast/ToastContext";
import PageHeader from "../UI/PageHeader";

function Upload() {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [userPapers, setUserPapers] = useState([]);
  const [loadingPapers, setLoadingPapers] = useState(true);


  const fetchUserPapers = useCallback(async () => {
    try {
      const data = await getMyPapers(auth.token);
      setUserPapers(data || []);
    } catch (err) {
      console.error("Failed to fetch user papers", err);
      toast.error("Failed to fetch user papers");
    } finally {
      setLoadingPapers(false);
    }
  }, [auth.token, toast]);

  useEffect(() => {
    if (auth.token) {
      fetchUserPapers();
    }
  }, [auth.token, fetchUserPapers]);

  // Cleanup preview URL to prevent browser memory leaks
  useEffect(() => {
    return () => {
      if (preview && preview.url) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview]);

  const handleFile = (selectedFile) => {
    if (!selectedFile) return;
    
    // Android Drag & Drop bug: Scoped storage prevents browser from reading the file, resulting in a 0 byte ghost file.
    if (selectedFile.size === 0) {
      toast.error("File is empty or inaccessible. Please click the upload box to select the file manually instead of dragging.");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10MB limit.");
      return;
    }
    
    // Validate file type (fallback to extension if type is empty)
    const isImage = selectedFile.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(selectedFile.name);
    const isPdf = selectedFile.type === "application/pdf" || /\.pdf$/i.test(selectedFile.name);
    
    if (!isImage && !isPdf) {
      toast.error("Invalid file type. Only PDF and images are allowed.");
      return;
    }

    setFile(selectedFile);
    setUploadSuccess(false);
    if (selectedFile.type === "application/pdf") {
      setPreview({ type: "pdf", url: URL.createObjectURL(selectedFile) });
    } else if (selectedFile.type.startsWith("image/")) {
      setPreview({ type: "image", url: URL.createObjectURL(selectedFile) });
    } else {
      setPreview(null);
    }
  };

  const handleFileChange = (e) => handleFile(e.target.files[0]);

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleRemoveFile = () => {
    setFile(null); setPreview(null); setUploadSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { toast.warning("Please select a file first"); return; }
    setUploading(true);
    try {
      const response = await uploadPaper(file, auth.token);
      toast.success(response.message || "Paper uploaded successfully!");
      setUploadSuccess(true);
      fetchUserPapers();
      setTimeout(() => navigate("/"), 4000);
    } catch (error) {
      toast.error(error.message || "Failed to upload paper.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="page-wrapper with-navbar dot-pattern-bg">
      <div className="page-content">
        {/* Header */}
        <PageHeader
          label="Publishing Center"
          title="Paper Upload"
          description="Contribute new exam papers to the database or view your history of previous uploads."
          style={{ marginBottom: 48 }}
        />

        {/* Two-Column Grid (Equal widths on desktop) */}
        <div className="upload-grid-layout grid-cols-1 lg:grid-cols-2">
          {/* Left Column — Upload Card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="card-elevated upload-box-card"
          >
            <div className="upload-title-container">
              <UploadCloud size={24} className="icon-primary" />
              <h2 className="serif-heading upload-card-title">
                Upload New Paper
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="upload-form">
              {/* Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => !file && fileInputRef.current?.click()}
                className="upload-dropzone"
                style={{
                  border: dragActive ? "2px solid var(--md-primary)" : "1px dashed var(--md-outline)",
                  background: dragActive ? "rgba(18, 35, 63, 0.02)" : "var(--md-surface-container-low)",
                  cursor: file ? "default" : "pointer",
                }}
              >
                <input
                  ref={fileInputRef} id="file-upload-input"
                  type="file" accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  disabled={uploading || uploadSuccess}
                  style={{ display: "none" }}
                />

                {!file ? (
                  <>
                    <UploadCloud
                      size={40}
                      className="upload-dropzone-icon"
                      style={{
                        color: dragActive ? "var(--md-primary)" : "var(--md-on-surface-variant)",
                      }}
                    />
                    <span className="serif-heading upload-dropzone-text">
                      Drag & drop your file here
                    </span>
                    <span className="text-body-small font-weight-500">
                      Supports PDF, PNG, JPG (Max 10MB)
                    </span>
                  </>
                ) : (
                  <div className="upload-file-wrapper">
                    <div className="upload-file-icon-box">
                      <FileText size={22} className="icon-primary" />
                    </div>
                    <div className="file-info-col">
                      <p className="text-title-small upload-file-name">
                        {file.name}
                      </p>
                      <p className="text-body-small upload-file-size">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    {!uploading && !uploadSuccess && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRemoveFile(); }}
                        className="upload-file-remove-btn"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Preview */}
              <AnimatePresence>
                {preview && !uploadSuccess && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="upload-preview-container"
                  >
                    {preview.type === "image" && (
                      <img src={preview.url} alt="Preview" className="upload-preview-image" />
                    )}
                    {preview.type === "pdf" && (
                      <iframe src={`${preview.url}#toolbar=0&view=FitH`} title="PDF Preview" className="upload-preview-pdf" />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Success Banner */}
              <AnimatePresence>
                {uploadSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="upload-success-container"
                  >
                    <CheckCircle size={20} className="upload-success-icon" />
                    <div>
                      <h4 className="text-title-medium upload-success-title">
                        Submission Received!
                      </h4>
                      <p className="text-body-medium upload-success-text">
                        {"Paper submitted successfully! It has been added to the queue for AI analysis and solution generation. We will notify you on the dashboard as soon as it's processed. Redirecting to home..."}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit */}
              {!uploadSuccess && (
                <button
                  type="submit"
                  disabled={!file || uploading}
                  className="btn-filled upload-submit-btn"
                >
                  {uploading ? (
                    <Loader size={18} className="loader-spinner" />
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Upload & Analyze</span>
                    </>
                  )}
                </button>
              )}
            </form>
          </motion.div>

          {/* Right Column — My Uploads Card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="card-elevated upload-box-card"
          >
            <div className="upload-title-container">
              <FileText size={24} className="icon-primary" />
              <h2 className="serif-heading upload-card-title">
                My Uploads
              </h2>
            </div>

            <div className="upload-divider" />

            <div className="upload-list-wrapper">
              {loadingPapers ? (
                <div className="upload-list-loader">
                  <div className="spinner spinner-lg spinner-primary" />
                  <p className="text-body-medium loader-text">Loading your uploads...</p>
                </div>
              ) : userPapers.length === 0 ? (
                <div className="upload-list-empty">
                  <FileText size={44} className="upload-empty-icon" />
                  <p className="text-body-medium upload-empty-title">
                    No papers uploaded yet
                  </p>
                  <p className="text-body-small">
                    Your uploaded papers will appear here once you upload them.
                  </p>
                </div>
              ) : (
                <div className="upload-list-scroll custom-scrollbar">
                  {userPapers.map((paper) => {
                    const isPending = paper._id?.startsWith("pending_");
                    return (
                      <div
                        key={paper._id}
                        onClick={() => {
                          if (isPending) {
                            toast.info("This paper is currently being analyzed by AI. It will appear on your dashboard when complete.");
                            return;
                          }
                          navigate(`/paper/${paper._id}`);
                        }}
                        className={`card-outlined${!isPending ? " card-item-hoverable" : ""} upload-item-card`}
                        style={{
                          cursor: isPending ? "wait" : "pointer",
                          background: isPending ? "var(--md-surface-container-low)" : "var(--md-surface)",
                          border: isPending ? "1px dashed var(--md-outline)" : "1px solid var(--md-outline-variant)",
                          opacity: isPending ? 0.8 : 1,
                        }}
                      >
                        <div className="upload-item-header">
                          <h3 className="serif-heading upload-item-title">
                            {paper.title}
                          </h3>
                        </div>
                        
                        <div className="upload-item-footer">
                          <div className="upload-item-badges">
                            <span className="badge badge-primary">
                              {paper.session} {paper.session_year || ""}
                            </span>
                            <span className="badge">
                              {paper.exam_type}
                            </span>
                          </div>
                          {isPending ? (
                            <div className="spinner spinner-mini" />
                          ) : (
                            <ArrowRight size={14} className="arrow-right-icon" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default Upload;
