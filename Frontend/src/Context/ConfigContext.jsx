import React, { createContext, useState, useEffect } from "react";
import { getConfig } from "../services/api";

export const ConfigContext = createContext({
  unlockCost: null,
  instituteDomain: null,
});

export const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState({ unlockCost: null, instituteDomain: null });

  useEffect(() => {
    getConfig()
      .then(data => {
        if (data) {
          setConfig({ 
            unlockCost: data.unlock_cost !== undefined ? data.unlock_cost : null,
            instituteDomain: data.institute_domain || null
          });
        }
      })
      .catch(err => console.error("Failed to load config", err));
  }, []);

  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  );
};
