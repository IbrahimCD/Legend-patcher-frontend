import axios from 'axios';

export default axios.create({
  baseURL: 'https://legend-patcher-backend.onrender.com',
  headers: { 'Content-Type': 'application/json' }
});
