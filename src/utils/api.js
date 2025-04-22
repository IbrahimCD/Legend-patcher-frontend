import axios from 'axios';

export default axios.create({
  baseURL: 'http://localhost:4000/api/patch',
  headers: { 'Content-Type': 'application/json' }
});
