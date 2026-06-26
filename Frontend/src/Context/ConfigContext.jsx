import React, { createContext, useState, useEffect } from "react";
import { getConfig } from "../services/api";

export const ConfigContext = createContext({
  unlockCost: null,
});

export const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState({ unlockCost: null });

  useEffect(() => {
    getConfig()
      .then(data => {
        if (data && data.unlock_cost !== undefined) {
          setConfig({ unlockCost: data.unlock_cost });
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
