import { createRoot } from 'react-dom/client';
import App from './App';
import { initRouter } from './router';
import './style.css';

initRouter();
createRoot(document.getElementById('root')!).render(<App />);
