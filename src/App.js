import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "./components/Dashboard";
import DashboardContent from "./components/DashboardContent";
import AssortmentPlans from "./components/AssortmentPlans";
import TechPacks from "./components/TechPacks";
import Pantone from "./components/Pantone";
import PrintStrike from "./components/PrintStrike";
import { ChatNotificationProvider } from "./context/ChatNotificationContext";
import { SharedPDFProvider } from "./context/SharedPDFContext";
import { NotificationProvider } from "./context/NotificationContext";
import LineSheets from "./components/LineSheets";
import LineSheetDetails from "./components/LineSheetDetails";
import PreProduction from "./components/PreProduction";
import PantoneLibrary from "./components/PantoneLibrary";
import DevelopmentSamples from "./components/DevelopmentSamples";

export default function App() {
  return (
    <NotificationProvider>
      <ChatNotificationProvider>
        <SharedPDFProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Dashboard />}>
              <Route index element={<DashboardContent />} />
              <Route path="/dashboard" element={<DashboardContent />} />
              <Route path="/assortment-plans" element={<AssortmentPlans />} />
              <Route path="/tech-packs" element={<TechPacks />} />
              <Route path="/pantone" element={<Pantone />} />
              <Route path="/print-strike" element={<PrintStrike />} />
              <Route path="/pre-production" element={<PreProduction />} />
              <Route path="/line-sheets" element={<LineSheets />} />
              <Route path="/line-sheets/:managerId" element={<LineSheetDetails />} />
              <Route path="/pantone-library" element={<PantoneLibrary />} />
              <Route path="/development-samples" element={<DevelopmentSamples />} />
            </Route>
          </Routes>
        </Router>
        </SharedPDFProvider>
      </ChatNotificationProvider>
    </NotificationProvider>
  );
}
