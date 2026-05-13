import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { Landing } from './routes/Landing';
import { SessionList } from './routes/SessionList';
import { SessionDetail } from './routes/SessionDetail';
import { Insights } from './routes/Insights';
import { DepthDivePlayer } from './routes/DepthDivePlayer';
import { PoolDivePlayer } from './routes/PoolDivePlayer';
import { DrySessionPlayer } from './routes/DrySessionPlayer';
import { Compare } from './routes/Compare';
import { Playground } from './routes/Playground';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/sessions" element={<SessionList />} />
        <Route path="/session/:id" element={<SessionDetail />} />
        <Route path="/session/:sessionId/dive/:diveIdx" element={<DepthDivePlayer />} />
        <Route path="/session/:sessionId/pool/:diveIdx" element={<PoolDivePlayer />} />
        <Route path="/session/:sessionId/dry" element={<DrySessionPlayer />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/playground" element={<Playground />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
