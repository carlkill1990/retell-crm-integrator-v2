import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/utils/api'
import {
  PhoneIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  XCircleIcon,
  CogIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline'

interface Activity {
  id: string
  type: 'call' | 'system'
  title: string
  status: 'success' | 'failed' | 'processing' | 'completed'
  statusText: string
  integration: string | null
  phoneNumber?: string
  duration?: number
  errorMessage?: string
  createdAt: string
  details: any
}

export default function ActivityPage() {
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]) // Today's date in YYYY-MM-DD format

  const { data: activities, isLoading, error } = useQuery({
    queryKey: ['activity-feed', activeFilter, selectedDate],
    queryFn: async () => {
      const response = await api.get(`/user/activity-feed?filter=${activeFilter}&date=${selectedDate}`)
      return response.data.data
    },
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />
      case 'failed':
        return <XCircleIcon className="h-5 w-5 text-red-500" />
      case 'processing':
        return <ClockIcon className="h-5 w-5 text-yellow-500 animate-pulse" />
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-blue-500" />
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />
    }
  }

  const getActivityIcon = (type: string) => {
    if (type === 'call') {
      return <PhoneIcon className="h-5 w-5 text-blue-600" />
    }
    return <CogIcon className="h-5 w-5 text-gray-600" />
  }

  const formatPhoneNumber = (phone?: string) => {
    if (!phone) return null
    return phone.replace(/^\+1/, '').replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Activity</h1>
        <div className="card p-6">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Activity</h1>
        <div className="card p-6">
          <p className="text-red-600">Failed to load activity feed. Please try again.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Activity</h1>
            <p className="text-gray-600">Recent calls and system updates</p>
          </div>
          
          {/* Date Picker */}
          <div className="flex items-center space-x-2">
            <CalendarIcon className="h-5 w-5 text-gray-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="block w-auto rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex-shrink-0 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'all', label: 'All Activity' },
            { id: 'calls', label: 'My Calls' },
            { id: 'settings', label: 'Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeFilter === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Activity Feed - Scrollable */}
      <div className="flex-1 min-h-0">
        {activities && activities.length > 0 ? (
          <div className="card h-full">
            <div className="h-full overflow-y-auto pr-2 -mr-2" style={{ maxHeight: 'calc(100vh - 280px)' }}>
              <div className="divide-y divide-gray-200">
                {activities.map((activity: Activity) => (
                  <div key={activity.id} className="p-6">
                    <div className="flex items-start space-x-4">
                      {/* Activity Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        {getActivityIcon(activity.type)}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            {/* Title */}
                            <p className="text-sm font-medium text-gray-900">
                              {activity.title}
                            </p>
                            
                            {/* Details */}
                            <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                              {activity.phoneNumber && (
                                <span>{formatPhoneNumber(activity.phoneNumber)}</span>
                              )}
                              {activity.duration && (
                                <span>• {formatDuration(activity.duration)}</span>
                              )}
                              {activity.integration && (
                                <span>• {activity.integration}</span>
                              )}
                              <span>• {formatTimeAgo(activity.createdAt)}</span>
                            </div>

                            {/* Status */}
                            <div className="mt-2 flex items-center space-x-2">
                              {getStatusIcon(activity.status)}
                              <span className={`text-sm font-medium ${
                                activity.status === 'success' ? 'text-green-700' :
                                activity.status === 'failed' ? 'text-red-700' :
                                activity.status === 'processing' ? 'text-yellow-700' :
                                'text-blue-700'
                              }`}>
                                {activity.statusText}
                              </span>
                            </div>

                            {/* Error Message */}
                            {activity.errorMessage && (
                              <div className="mt-2 p-2 bg-red-50 rounded-md">
                                <p className="text-sm text-red-700">{activity.errorMessage}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="card p-8 text-center h-full flex items-center justify-center">
            <div>
              <ClockIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {selectedDate === new Date().toISOString().split('T')[0] ? 'No activity today' : `No activity on ${selectedDate}`}
              </h3>
              <p className="text-gray-600">
                {activeFilter === 'calls' 
                  ? 'Call activities will appear here once your integrations start processing calls.'
                  : activeFilter === 'settings'
                  ? 'System activities will appear here when you make changes to your account or integrations.'
                  : 'All activities will appear here once you start using your integrations.'
                }
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}