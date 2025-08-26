import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/utils/api'
import toast from 'react-hot-toast'
import { 
  PlusIcon,
  DocumentDuplicateIcon,
  CheckCircleIcon,
  XCircleIcon,
  PencilIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'

export default function IntegrationsPage() {
  const queryClient = useQueryClient()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  
  const { data: integrations, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const response = await api.get('/integrations')
      return response.data.data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      await api.delete(`/integrations/${integrationId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Integration deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete integration')
    },
  })

  const publishMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      await api.post(`/integrations/${integrationId}/publish`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Draft integration published successfully!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to publish integration')
    },
  })

  const renameMutation = useMutation({
    mutationFn: async ({ integrationId, name }: { integrationId: string, name: string }) => {
      await api.put(`/integrations/${integrationId}`, { name })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Integration renamed successfully!')
      setRenamingId(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to rename integration')
    },
  })

  const handleDeleteIntegration = (integrationId: string, integrationName: string) => {
    if (window.confirm(`Are you sure you want to delete the integration "${integrationName}"? This action cannot be undone.`)) {
      deleteMutation.mutate(integrationId)
    }
  }

  const handlePublishDraft = (integrationId: string, integrationName: string) => {
    if (window.confirm(`Publish the draft integration "${integrationName}"? This will make it active and start processing webhooks.`)) {
      publishMutation.mutate(integrationId)
    }
  }

  const handleStartRename = (integrationId: string, currentName: string) => {
    setRenamingId(integrationId)
    setNewName(currentName)
  }

  const handleCancelRename = () => {
    setRenamingId(null)
    setNewName('')
  }

  const handleConfirmRename = (integrationId: string) => {
    if (newName.trim()) {
      renameMutation.mutate({ integrationId, name: newName.trim() })
    }
  }

  // No need for useEffect - agent names are stored in database
  // const [agentNames, setAgentNames] = useState<Record<string, string>>({}) - removing this

  const getStatusBadge = (integration: any) => {
    if (integration.isDraft) {
      return (
        <span className="badge-warning">
          <DocumentDuplicateIcon className="h-3 w-3 mr-1" />
          Draft
        </span>
      )
    }
    return integration.isActive ? (
      <span className="badge-success">
        <CheckCircleIcon className="h-3 w-3 mr-1" />
        Active
      </span>
    ) : (
      <span className="badge-danger">
        <XCircleIcon className="h-3 w-3 mr-1" />
        Inactive
      </span>
    )
  }

  const copyWebhookUrl = (webhookUrl: string) => {
    navigator.clipboard.writeText(webhookUrl)
    toast.success('Webhook URL copied to clipboard!')
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="loading-skeleton h-8 w-64"></div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-6">
              <div className="loading-skeleton h-6 w-48 mb-4"></div>
              <div className="loading-skeleton h-4 w-full mb-2"></div>
              <div className="loading-skeleton h-4 w-32"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 overflow-visible">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
          <p className="text-gray-600">
            Manage your Retell AI and CRM integrations
          </p>
        </div>
        {/* Only show header button when there are existing integrations */}
        {integrations && integrations.length > 0 && (
          <div className="flex-shrink-0">
            <Link 
              to="/integrations/new?new=true" 
              className="btn-primary inline-flex items-center"
            >
              <PlusIcon className="h-5 w-5 mr-2 flex-shrink-0" />
              New Integration
            </Link>
          </div>
        )}
      </div>

      {/* Integrations Grid */}
      {integrations && integrations.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {integrations.map((integration: any) => (
            <div key={integration.id} className="card p-6 group">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    {renamingId === integration.id ? (
                      <div className="flex items-center space-x-2 flex-1">
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="text-lg font-medium text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 flex-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleConfirmRename(integration.id)
                            } else if (e.key === 'Escape') {
                              handleCancelRename()
                            }
                          }}
                        />
                        <button
                          onClick={() => handleConfirmRename(integration.id)}
                          className="text-green-600 hover:text-green-700 p-1"
                          disabled={renameMutation.isPending}
                          title="Confirm rename"
                        >
                          <CheckIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={handleCancelRename}
                          className="text-gray-400 hover:text-gray-600 p-1"
                          title="Cancel rename"
                        >
                          <XCircleIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 flex-1">
                        <h3 className="text-lg font-medium text-gray-900 flex-1">
                          {integration.name}
                        </h3>
                        <button
                          onClick={() => handleStartRename(integration.id, integration.name)}
                          className="text-gray-400 hover:text-gray-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Rename integration"
                        >
                          <PencilIcon className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    {integration.description || 'No description'}
                  </p>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Retell Agent:</span>
                      <span className="font-medium text-right">
                        {integration.retellAgentId ? (
                          <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs">
                            {integration.retellAgentName || 'Agent Name'}
                          </span>
                        ) : (
                          <span className="text-gray-500">Not configured</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">CRM:</span>
                      <span className="font-medium capitalize">
                        {integration.crmAccount?.provider} ({integration.crmAccount?.accountName})
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Events (Today):</span>
                      <span className="font-medium">
                        {integration._count?.webhookEventsToday || 0}
                      </span>
                    </div>
                  </div>
                  
                  {integration.webhookUrl && (
                    <div className="mt-3 p-2 bg-gray-50 rounded border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-700">
                          Webhook URL
                        </span>
                        <button
                          onClick={() => copyWebhookUrl(integration.webhookUrl)}
                          className="inline-flex items-center px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                          title="Copy webhook URL"
                        >
                          <ClipboardDocumentIcon className="h-3 w-3 mr-0.5" />
                          Copy
                        </button>
                      </div>
                      <div className="text-xs text-gray-600 font-mono bg-white px-2 py-1 rounded border border-gray-300 break-all">
                        {integration.webhookUrl}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="ml-4">
                  {getStatusBadge(integration)}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  Updated {new Date(integration.updatedAt).toLocaleDateString()}
                </div>
                <div className="flex space-x-2">
                  {integration.isDraft ? (
                    // Draft integration actions - same style as regular integrations
                    <>
                      <Link
                        to={`/integrations/${integration.id}/continue`}
                        className="text-gray-400 hover:text-gray-600"
                        title="Complete setup"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Link>
                      <button 
                        onClick={() => handleDeleteIntegration(integration.id, integration.name)}
                        className="text-gray-400 hover:text-red-600"
                        disabled={deleteMutation.isPending}
                        title="Delete draft"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    // Regular integration actions
                    <>
                      <Link
                        to={`/integrations/${integration.id}/edit`}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Link>
                      <button 
                        onClick={() => handleDeleteIntegration(integration.id, integration.name)}
                        className="text-gray-400 hover:text-red-600"
                        disabled={deleteMutation.isPending}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <DocumentDuplicateIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No integrations</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating your first integration.
          </p>
          <div className="mt-6">
            <Link 
              to="/integrations/new?new=true" 
              className="btn-primary inline-flex items-center"
            >
              <PlusIcon className="h-5 w-5 mr-2 flex-shrink-0" />
              New Integration
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}