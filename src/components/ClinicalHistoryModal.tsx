import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ClinicalHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventLog: string[];
}

export const ClinicalHistoryModal: React.FC<ClinicalHistoryModalProps> = ({ isOpen, onClose, eventLog }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            style={{
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "16px",
              padding: "2rem",
              width: "100%",
              maxWidth: "500px",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()} // Prevent clicks inside modal from closing it
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h2 style={{ margin: 0, color: "#f8fafc", fontSize: "1.5rem" }}>Expediente Médico</h2>
              <button
                onClick={onClose}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  padding: "0.5rem",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            
            {eventLog.length === 0 ? (
              <p style={{ color: "#94a3b8", fontStyle: "italic", textAlign: "center" }}>Aún no hay registros en el expediente.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {eventLog.map((log, index) => (
                  <div key={index} style={{
                    padding: "1rem",
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: "8px",
                    borderLeft: "4px solid #38bdf8",
                  }}>
                    <strong style={{ display: "block", color: "#38bdf8", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                      Turno {index}
                    </strong>
                    <span style={{ color: "#e2e8f0", lineHeight: "1.5" }}>{log}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
