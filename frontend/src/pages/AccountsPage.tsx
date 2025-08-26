import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/utils/api'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'

interface Account {
  id: string
  provider: string
  providerType: string
  accountName: string
  accountEmail?: string
  isActive: boolean
  lastSyncAt?: string
  createdAt: string
  expiresAt?: string
}

export default function AccountsPage() {
  const queryClient = useQueryClient()
  
  const { data: accounts, isLoading, error } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await api.get('/accounts')
      return response.data.data
    },
  })

  const { data: integrations } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const response = await api.get('/integrations')
      return response.data.data
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await api.delete(`/accounts/${accountId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Account disconnected successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || 'Failed to disconnect account'
      toast.error(errorMessage)
    },
  })

  // Count how many integrations use each account
  const getAccountUsage = (accountId: string) => {
    if (!integrations) return 0
    return integrations.filter((integration: any) => 
      integration.retellAccountId === accountId || integration.crmAccountId === accountId
    ).length
  }

  const handleDisconnectAccount = (account: Account, usageCount: number) => {
    const providerName = getProviderDisplayName(account.provider)
    const accountName = account.accountName || 'Unnamed Account'
    
    if (usageCount > 0) {
      const integrationText = usageCount === 1 ? 'integration' : 'integrations'
      if (window.confirm(`⚠️ Cannot disconnect "${accountName}"\n\nThis ${providerName} account is currently used by ${usageCount} active ${integrationText}. Please delete those integrations first, then try disconnecting this account.`)) {
        // User acknowledged the warning, but we still don't proceed with deletion
        return
      }
    } else {
      const confirmMessage = `Are you sure you want to disconnect "${accountName}"?\n\nThis ${providerName} account will be permanently removed from your connected accounts.`
      if (window.confirm(confirmMessage)) {
        disconnectMutation.mutate(account.id)
      }
    }
  }

  const getProviderIcon = (provider: string) => {
    const iconMap: { [key: string]: string } = {
      retell: '🎯',
      pipedrive: '📊',
      hubspot: '🟠',
      salesforce: '☁️',
      zoho: '📈',
    }
    return iconMap[provider.toLowerCase()] || '🔗'
  }

  const getProviderDisplayName = (provider: string) => {
    const nameMap: { [key: string]: string } = {
      retell: 'Retell AI',
      pipedrive: 'Pipedrive',
      hubspot: 'HubSpot',
      salesforce: 'Salesforce',
      zoho: 'Zoho CRM',
    }
    return nameMap[provider.toLowerCase()] || provider
  }

  const getConnectionType = (providerType: string) => {
    return providerType === 'voice_ai' ? 'API Key' : 'OAuth'
  }

  const getAccountStatus = (account: Account) => {
    if (!account.isActive) {
      return { status: 'inactive', icon: ExclamationTriangleIcon, color: 'text-gray-500', bg: 'bg-gray-100' }
    }
    
    // For OAuth accounts, check if token needs refresh (but don't worry user about it)
    // The system handles token refresh automatically
    return { status: 'active', icon: CheckCircleIcon, color: 'text-green-600', bg: 'bg-green-100' }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Connected Accounts</h1>
        <div className="card p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Connected Accounts</h1>
        <div className="card p-6">
          <p className="text-red-600">Failed to load accounts. Please try again.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Connected Accounts</h1>
        <p className="text-gray-600">
          Overview of your connected CRM and Voice AI accounts
        </p>
      </div>

      {accounts && accounts.length > 0 ? (
        <>
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700">
              Connected Accounts ({accounts.length})
            </h3>
          </div>
          
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account: Account) => {
              const accountStatus = getAccountStatus(account)
              const usageCount = getAccountUsage(account.id)
              
              return (
                <div key={account.id} className="card p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">
                        {getProviderIcon(account.provider)}
                      </span>
                      <div>
                        <h4 className="text-lg font-medium text-gray-900">
                          {getProviderDisplayName(account.provider)}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {account.accountName || 'Unnamed Account'}
                        </p>
                        {account.accountEmail && (
                          <p className="text-xs text-gray-500">
                            {account.accountEmail}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleDisconnectAccount(account, usageCount)}
                        disabled={disconnectMutation.isPending}
                        className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        title="Disconnect account"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                      <div className={`inline-flex items-center p-1.5 rounded-lg ${accountStatus.bg}`}>
                        <accountStatus.icon className={`h-4 w-4 ${accountStatus.color}`} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Connection Type:</span>
                      <span className="font-medium text-gray-900">
                        {getConnectionType(account.providerType)}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Status:</span>
                      <span className={`font-medium ${accountStatus.color}`}>
                        {accountStatus.status === 'active' && 'Connected'}
                        {accountStatus.status === 'inactive' && 'Inactive'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Used in:</span>
                      <span className="font-medium text-gray-900">
                        {usageCount} integration{usageCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {account.lastSyncAt && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Connected:</span>
                        <span className="text-gray-600">
                          {new Date(account.lastSyncAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="card p-8 text-center">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
            <ClockIcon className="h-12 w-12" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No accounts connected</h3>
          <p className="text-gray-600 mb-4">
            Connect your CRM and Voice AI accounts by creating your first integration.
          </p>
          <Link
            to="/integrations/new?new=true"
            className="btn-primary inline-flex items-center"
          >
            Create Your First Integration
          </Link>
        </div>
      )}
    </div>
  )
}