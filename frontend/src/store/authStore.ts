import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/utils/api'
import { QueryClient } from '@tanstack/react-query'

// Create a singleton QueryClient reference for cache clearing
let queryClientRef: QueryClient | null = null

export const setQueryClient = (client: QueryClient) => {
  queryClientRef = client
}

interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  subscriptionTier: string
  subscriptionStatus: string
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => void
  refreshAuth: () => Promise<void>
  initialize: () => void
}

interface RegisterData {
  email: string
  password: string
  firstName?: string
  lastName?: string
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email: string, password: string) => {
        try {
          const response = await api.post('/auth/login', { email, password })
          const { user, accessToken, refreshToken } = response.data.data

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
          })

          // Set default authorization header
          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
          
          // Clear all cached data to ensure new user sees only their data
          if (queryClientRef) {
            queryClientRef.clear()
            console.log('🔄 Cleared React Query cache for new user login')
          }
        } catch (error: any) {
          throw new Error(error.response?.data?.error || 'Login failed')
        }
      },

      register: async (data: RegisterData) => {
        try {
          const response = await api.post('/auth/register', data)
          const { user, accessToken, refreshToken } = response.data.data

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
          })

          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
          
          // Clear all cached data to ensure new user starts fresh
          if (queryClientRef) {
            queryClientRef.clear()
            console.log('🔄 Cleared React Query cache for new user registration')
          }
        } catch (error: any) {
          throw new Error(error.response?.data?.error || 'Registration failed')
        }
      },

      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        })

        delete api.defaults.headers.common['Authorization']
        
        // Clear all cached data when user logs out
        if (queryClientRef) {
          queryClientRef.clear()
          console.log('🔄 Cleared React Query cache on user logout')
        }
      },

      refreshAuth: async () => {
        const { refreshToken } = get()
        if (!refreshToken) throw new Error('No refresh token')

        try {
          const response = await api.post('/auth/refresh', { refreshToken })
          const { user, accessToken, refreshToken: newRefreshToken } = response.data.data

          set({
            user,
            accessToken,
            refreshToken: newRefreshToken,
            isAuthenticated: true,
          })

          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
        } catch (error) {
          get().logout()
          throw error
        }
      },

      initialize: () => {
        const { accessToken, refreshToken } = get()
        
        if (accessToken) {
          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
          set({ isAuthenticated: true })
        }

        set({ isLoading: false })

        // Set up response interceptor for token refresh
        api.interceptors.response.use(
          (response) => response,
          async (error) => {
            if (error.response?.status === 401 && refreshToken) {
              try {
                await get().refreshAuth()
                // Retry the original request
                return api.request(error.config)
              } catch (refreshError) {
                get().logout()
                return Promise.reject(refreshError)
              }
            }
            return Promise.reject(error)
          }
        )
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
)