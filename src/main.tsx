import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { Landing } from './routes/Landing';
import { SessionList } from './routes/SessionList';
import { SessionDetail } from './routes/SessionDetail';
import { Insights } from './routes/Insights';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/sessions" element={<SessionList />} />
        <Route path="/session/:id" element={<SessionDetail />} />
        <Route path="/insights" element={<Insights />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
