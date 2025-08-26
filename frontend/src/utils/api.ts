import axios from 'axios'

export const api = axios.create({
  baseURL: 'http://localhost:3002/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - get token from Zustand auth store
api.interceptors.request.use(
  (config) => {
    // Get token from localStorage (used by Zustand persist)
    const authData = localStorage.getItem('auth-storage')
    if (authData) {
      try {
        const parsed = JSON.parse(authData)
        if (parsed.state?.accessToken) {
          config.headers.Authorization = `Bearer ${parsed.state.accessToken}`
        }
      } catch (error) {
        console.warn('Failed to parse auth storage:', error)
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor - simplified to avoid conflicts with auth store
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    // Only handle non-auth errors here - auth is handled by the auth store
    if (error.response?.status === 429) {
      throw new Error('Too many requests. Please try again later.')
    }
    
    if (error.response?.status >= 500) {
      throw new Error('Server error. Please try again later.')
    }
    
    return Promise.reject(error)
  }
)