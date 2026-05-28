import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import StudentPage from './pages/StudentPage';
import AdvisorPage from './pages/AdvisorPage';
import ViewerPage from './pages/ViewerPage';
import AdminPage from './pages/AdminPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/student" element={<StudentPage />} />
          <Route path="/advisor" element={<AdvisorPage />} />
          <Route path="/viewer" element={<ViewerPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);