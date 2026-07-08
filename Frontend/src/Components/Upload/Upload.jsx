import React, { useState, useContext, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { UploadCloud, FileText, X, CheckCircle, Sparkles, ArrowRight, Loader, GripVertical } from "lucide-react";
import AuthContext from "../../Context/AuthContext";
import { uploadPaper, getMyPapers } from "../../services/api";
import { useToast } from "../Toast/ToastContext";
import PageHeader from "../UI/PageHeader";
import { jsPDF } from "jspdf";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const generateStitchedPDF = async (imageFiles) => {
  const pdf = new jsPDF("p", "mm", "a4");
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = URL.createObjectURL(file);
    });

    const imgRatio = img.width / img.height;
    const pdfRatio = pdfWidth / pdfHeight;
    let finalWidth = pdfWidth;
    let finalHeight = pdfHeight;
    
    if (imgRatio > pdfRatio) {
      finalHeight = pdfWidth / imgRatio;
    } else {
      finalWidth = pdfHeight * imgRatio;
    }

    if (i > 0) pdf.addPage();
    pdf.addImage(img, 'JPEG', 0, 0, finalWidth, finalHeight, undefined, 'FAST');
    URL.revokeObjectURL(img.src);
  }
  
  const pdfBlob = pdf.output("blob");
  return new File([pdfBlob], "stitched_paper.pdf", { type: "application/pdf" });
};

function SortableFileItem({ f, index, uploading, handleRemoveFile, showDragHandle }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: f.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : "auto",
    position: "relative",
  };

  return (
    <div ref={setNodeRef} style={style} className="upload-file-item">
      {showDragHandle && !uploading && (
        <div {...attributes} {...listeners} className="upload-drag-handle">
          <GripVertical size={16} style={{ color: "var(--md-on-surface-variant)" }} />
        </div>
      )}
      
      <div className="upload-file-icon-box">
        {f.file.type.startsWith("image/") ? (
          <img src={f.previewUrl} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
        ) : (
          <FileText size={22} style={{ color: "var(--md-on-primary-container)" }} />
        )}
      </div>
      
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="text-title-small" style={{ textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden", margin: 0, fontWeight: 600 }}>
          {f.file.name}
        </p>
        <p className="text-body-small" style={{ margin: 0, marginTop: 2, color: "var(--md-on-surface-variant)" }}>
          {(f.file.size / (1024 * 1024)).toFixed(2)} MB
        </p>
      </div>

      {!uploading && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleRemoveFile(index);
          }}
          className="upload-file-remove-btn"
          aria-label="Remove file"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function Upload() {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState([]);
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
      files.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, [files]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleFiles = (selectedFiles) => {
    const validFiles = Array.from(selectedFiles).filter(file => {
      if (file.size === 0) return false;
      const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      return isImage || isPdf;
    });

    if (validFiles.length === 0) {
      toast.error("Invalid file type or empty file. Only PDF and images are allowed.");
      return;
    }

    // If a PDF is uploaded, it must be the ONLY file
    const hasPdf = validFiles.some(f => f.type === "application/pdf");
    if (hasPdf) {
       if (validFiles.length > 1 || files.length > 0) {
         toast.error("If uploading a PDF, you cannot upload multiple files.");
         return;
       }
    }

    if (files.length + validFiles.length > 5) {
      toast.warning("Maximum of 5 images allowed.");
    }

    const newFiles = validFiles.slice(0, 5 - files.length).map(f => ({
      id: Math.random().toString(36).substring(7),
      file: f,
      previewUrl: URL.createObjectURL(f),
    }));

    setFiles([...files, ...newFiles]);
    setUploadSuccess(false);
  };

  const handleFileChange = (e) => {
    if (e.target.files) handleFiles(e.target.files);
  };

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  const handleRemoveFile = (index) => {
    const newFiles = [...files];
    if (newFiles[index].previewUrl) URL.revokeObjectURL(newFiles[index].previewUrl);
    newFiles.splice(index, 1);
    setFiles(newFiles);
    setUploadSuccess(false);
    if (newFiles.length === 0 && fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (files.length === 0) { toast.warning("Please select files first"); return; }
    setUploading(true);
    try {
      let finalFileToUpload = files[0].file;
      
      if (files.length > 1 || files[0].file.type.startsWith("image/")) {
         toast.info("Stitching and compressing images into PDF...");
         finalFileToUpload = await generateStitchedPDF(files.map(f => f.file));
         
         if (finalFileToUpload.size > 10 * 1024 * 1024) {
             throw new Error("Final stitched PDF is still over 10MB. Please use fewer pages.");
         }
      }

      const response = await uploadPaper(finalFileToUpload, auth.token);
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
              {/* Hidden file input — always rendered, ref stays stable */}
              <input
                ref={fileInputRef} id="file-upload-input"
                type="file" accept="image/*,application/pdf"
                multiple
                onChange={handleFileChange}
                disabled={uploading || uploadSuccess || files.length >= 5}
                style={{ display: "none" }}
              />

              {/* Drop Zone — only show when no files selected yet */}
              {files.length === 0 && (
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="upload-dropzone"
                  style={{
                    border: dragActive ? "2px solid var(--md-primary)" : "1.5px dashed var(--md-outline)",
                    background: dragActive ? "rgba(18, 35, 63, 0.03)" : "var(--md-surface-container-low)",
                    cursor: "pointer",
                  }}
                >
                  <UploadCloud
                    size={36}
                    style={{
                      color: dragActive ? "var(--md-primary)" : "var(--md-on-surface-variant)",
                      opacity: 0.6,
                    }}
                  />
                  <span className="serif-heading" style={{ fontSize: "1.05rem", color: "var(--md-on-surface)" }}>
                    Click or drag & drop files here
                  </span>
                  <span className="text-body-small" style={{ color: "var(--md-on-surface-variant)" }}>
                    Supports PDF or up to 5 images (stitched automatically)
                  </span>
                </div>
              )}

              {/* File List / Preview */}
              {files.length > 0 && !uploadSuccess && (
                <div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={files.map((f) => f.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="upload-file-list">
                        {files.map((f, index) => (
                          <SortableFileItem
                            key={f.id}
                            f={f}
                            index={index}
                            uploading={uploading}
                            handleRemoveFile={handleRemoveFile}
                            showDragHandle={files.length > 1 && files.every(item => item.file.type.startsWith("image/"))}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>

                  {/* Add more files button — only for images when under limit */}
                  {files.length < 5 && files.every(f => f.file.type.startsWith("image/")) && !uploading && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="upload-add-more-btn"
                    >
                      + Add more images ({files.length}/5)
                    </button>
                  )}
                </div>
              )}

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
                  disabled={files.length === 0 || uploading}
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
