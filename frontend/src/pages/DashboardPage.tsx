import { useQuery } from '@tanstack/react-query'
import { api } from '@/utils/api'
import { useAuthStore } from '@/store/authStore'
import {
  ChartBarIcon,
  DocumentDuplicateIcon,
  LinkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

export default function DashboardPage() {
  const { user } = useAuthStore()

  const { data: stats } = useQuery({
    queryKey: ['user-statistics'],
    queryFn: async () => {
      const response = await api.get('/user/statistics')
      return response.data.data
    },
  })


  const dashboardCards = [
    {
      name: 'Total Integrations',
      value: stats?.integrations?.total || 0,
      subValue: `${stats?.integrations?.active || 0} active`,
      icon: DocumentDuplicateIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      name: 'Connected Accounts',
      value: stats?.connectedAccounts || 0,
      subValue: 'CRM & Voice AI',
      icon: LinkIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      name: 'Calls Processed',
      value: stats?.calls?.total || 0,
      subValue: `${stats?.calls?.completed || 0} completed`,
      icon: ChartBarIcon,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      name: 'System Health',
      value: stats?.systemHealth || 'Checking...',
      subValue: 'All integrations',
      icon: CheckCircleIcon,
      color: stats?.systemHealth === 'Operational' ? 'text-emerald-600' : 'text-yellow-600',
      bgColor: stats?.systemHealth === 'Operational' ? 'bg-emerald-100' : 'bg-yellow-100',
    },
  ]

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />
      case 'failed':
        return <XCircleIcon className="h-5 w-5 text-red-500" />
      case 'ongoing':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />
      case 'processing':
      case 'retrying':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />
      default:
        return <ChartBarIcon className="h-5 w-5 text-gray-500" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.firstName || user?.email}!
        </h1>
        <p className="text-gray-600">
          Here's what's happening with your integrations today.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {dashboardCards.map((card) => (
          <div key={card.name} className="card p-5">
            <div className="flex items-center">
              <div className={`flex-shrink-0 p-3 rounded-lg ${card.bgColor}`}>
                <card.icon className={`h-6 w-6 ${card.color}`} />
              </div>
              <div className="ml-5">
                <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
                <p className="text-sm text-gray-500">{card.subValue}</p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-700">{card.name}</p>
            </div>
          </div>
        ))}
      </div>


      {/* Recent Activity */}
      <div className="card">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
        </div>
        <div className="p-6">
          {stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div className="flow-root max-h-96 overflow-y-auto pr-2 -mr-2" style={{ maxHeight: 'min(24rem, 40vh)' }}>
              <ul className="-mb-8">
                {stats.recentActivity.map((call: any, index: number) => (
                  <li key={call.id}>
                    <div className="relative pb-8">
                      {index !== stats.recentActivity.length - 1 && (
                        <span
                          className="absolute top-5 left-5 -ml-px h-full w-0.5 bg-gray-200"
                          aria-hidden="true"
                        />
                      )}
                      <div className="relative flex items-start space-x-3">
                        <div className="relative">
                          {getStatusIcon(call.status)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div>
                            <div className="text-sm">
                              <span className="font-medium text-gray-900">
                                📞 {call.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call • {call.agentName}
                              </span>
                            </div>
                            <p className="mt-0.5 text-sm text-gray-500">
                              {call.fromNumber} → {call.toNumber} • 
                              {call.duration ? `${call.duration}s` : 'ongoing'} • 
                              {call.status}
                            </p>
                          </div>
                          <div className="mt-2 text-sm text-gray-700">
                            <time dateTime={call.createdAt}>
                              {new Date(call.createdAt).toLocaleDateString()} at{' '}
                              {new Date(call.createdAt).toLocaleTimeString()}
                            </time>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-center py-6">
              <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No recent calls</h3>
              <p className="mt-1 text-sm text-gray-500">
                Calls will appear here once your integration starts processing webhooks.
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}