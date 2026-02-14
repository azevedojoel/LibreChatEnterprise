import axios from 'axios';

// Ensure cookies (e.g. refreshToken) are sent with all requests, including cross-origin scenarios on Railway
axios.defaults.withCredentials = true;

export function setAcceptLanguageHeader(value: string): void {
  axios.defaults.headers.common['Accept-Language'] = value;
}

export function setTokenHeader(token: string) {
  axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
}
