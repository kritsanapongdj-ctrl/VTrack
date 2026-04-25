import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// ถ้าคุณเซฟไฟล์โค้ดผมไว้ชื่อ VTrackApp.jsx ให้ใช้บรรทัดล่างนี้:
import App from './VTrackApp.jsx' 
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)