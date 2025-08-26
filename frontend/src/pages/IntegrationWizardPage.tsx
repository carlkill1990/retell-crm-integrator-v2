import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  CheckIcon,
  ChevronRightIcon,
  LinkIcon,
  CogIcon,
  DocumentCheckIcon,
  PlayIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/utils/api'
import { useAuthStore } from '@/store/authStore'

interface StepProps {
  title: string
  description: string
  isActive: boolean
  isCompleted: boolean
  stepNumber: number
}

interface FieldMapping {
  sourceField: string
  targetField: string
  targetLevel1?: string  // For two-level fields like activity type, pipeline
  targetLevel2?: string  // For two-level fields like activity field, stage
  booleanValue?: boolean  // For boolean fields - true or false
  transform?: string
  required: boolean
  source?: 'universal' | 'workflow' | 'manual'  // Track mapping source
  workflowName?: string  // If from workflow, which one
}

interface IntegrationConfig {
  name: string
  description: string
  retellAccountId: string
  selectedAgentId: string
  crmProvider: string
  crmAccountId: string
  integrationType: string // inbound, outbound, both
  selectedGoal?: string
  businessWorkflows: BusinessWorkflow[]
  fieldMappings: FieldMapping[]
  webhookUrl: string
  syncFrequency: string
  enabled: boolean
  selectedPipelineId?: string
  selectedStageId?: string
  discoveredFields: RetellField[]
  lastWebhookSample: any | null
  availableAgents: RetellAgent[]
  integrationSaved?: boolean
}

interface BusinessWorkflow {
  id: string
  name: string
  description: string
  trigger: WorkflowTrigger
  conditions: WorkflowCondition[]
  actions: WorkflowAction[]
  enabled: boolean
}

interface WorkflowTrigger {
  event: string // 'call_analyzed', 'call_started', etc.
}

interface WorkflowCondition {
  field: string // e.g., 'call_analysis.custom_analysis_data.consultation_booking_status'
  operator: string // 'equals', 'contains', 'not_equals', 'exists', etc.
  value: any
  logicalOperator?: 'AND' | 'OR' // for chaining conditions
}

interface WorkflowAction {
  type: string // 'create_deal', 'update_person', 'create_activity', 'update_deal_stage', etc.
  crmObject: string // 'person', 'deal', 'activity', 'organization'
  fields: { [key: string]: string | number | boolean } // field mappings for this action
  conditions?: string // optional condition for this specific action
}

interface RetellAgent {
  agent_id: string
  name: string
  description?: string
  created_at: string
  last_call?: string
  call_count?: number
  active: boolean
  customFieldsCount?: number
  customFields?: string[]
  fieldsByCategory?: {
    variables: Set<string>
    metadata: Set<string>
    analysis: Set<string>
  }
  purposes?: {
    inbound: boolean
    outbound: boolean
    phoneNumbers: string[]
  }
  canHandleInbound?: boolean
  canHandleOutbound?: boolean
  canHandleBoth?: boolean
  primaryPurpose?: 'inbound' | 'outbound' | 'both' | 'none'
}

interface RetellField {
  id: string
  name: string
  type: string
  description: string
  category: string
  isCustom?: boolean
  sampleValue?: any
}

const STEPS = [
  { id: 'basic', title: 'Basic Information', description: 'Name and describe your integration' },
  { id: 'accounts', title: 'Connect Accounts', description: 'Link your Retell AI and CRM accounts' },
  { id: 'flow', title: 'What This Does', description: 'See how your calls will be processed' },
  { id: 'pipeline', title: 'Deal Destination', description: 'Choose pipeline and stage for successful calls' },
  { id: 'review', title: 'Complete Setup', description: 'Finish and get your webhook URL' },
]

const CRM_PROVIDERS = [
  { id: 'pipedrive', name: 'Pipedrive', logo: '🟠', description: 'Sales pipeline management' },
  { id: 'hubspot', name: 'HubSpot', logo: '🟡', description: 'Inbound marketing & sales' },
  { id: 'salesforce', name: 'Salesforce', logo: '🔵', description: 'Customer relationship management' },
  { id: 'zoho', name: 'Zoho CRM', logo: '🟣', description: 'Business management suite' },
]

// Standard Retell webhook fields that are always available
const STANDARD_RETELL_FIELDS = [
  // Core call data
  { id: 'call_id', name: 'Call ID', type: 'string', description: 'Unique identifier for the call', category: 'Core' },
  { id: 'agent_id', name: 'Agent ID', type: 'string', description: 'ID of the AI agent', category: 'Core' },
  { id: 'agent_name', name: 'Agent Name', type: 'string', description: 'Name of the AI agent', category: 'Core' },
  { id: 'call_type', name: 'Call Type', type: 'string', description: 'Type of call (phone_call, etc.)', category: 'Core' },
  { id: 'call_status', name: 'Call Status', type: 'string', description: 'Status of the call (ended, etc.)', category: 'Core' },
  
  // Timing data
  { id: 'start_timestamp', name: 'Start Time', type: 'timestamp', description: 'When the call started', category: 'Timing' },
  { id: 'end_timestamp', name: 'End Time', type: 'timestamp', description: 'When the call ended', category: 'Timing' },
  { id: 'duration_ms', name: 'Duration (ms)', type: 'number', description: 'Call duration in milliseconds', category: 'Timing' },
  
  // Phone numbers
  { id: 'from_number', name: 'From Number', type: 'string', description: 'Caller phone number', category: 'Contact' },
  { id: 'to_number', name: 'To Number', type: 'string', description: 'Called phone number', category: 'Contact' },
  
  // Content
  { id: 'transcript', name: 'Call Transcript', type: 'text', description: 'Full conversation transcript', category: 'Content' },
  { id: 'recording_url', name: 'Recording URL', type: 'url', description: 'Link to call recording', category: 'Content' },
  { id: 'public_log_url', name: 'Public Log URL', type: 'url', description: 'Link to public call log', category: 'Content' },
  
  // Analysis (standard)
  { id: 'call_analysis.call_summary', name: 'Call Summary', type: 'text', description: 'AI-generated call summary', category: 'Analysis' },
  { id: 'call_analysis.call_successful', name: 'Call Successful', type: 'boolean', description: 'Whether call was successful', category: 'Analysis' },
  { id: 'call_analysis.in_voicemail', name: 'In Voicemail', type: 'boolean', description: 'Whether call went to voicemail', category: 'Analysis' },
  { id: 'call_analysis.qualified_lead', name: 'Qualified Lead', type: 'boolean', description: 'Whether prospect is qualified', category: 'Analysis' },
  { id: 'call_analysis.interested', name: 'Customer Interested', type: 'boolean', description: 'Whether customer showed interest', category: 'Analysis' },
  { id: 'call_analysis.callback_requested', name: 'Callback Requested', type: 'boolean', description: 'Whether customer requested callback', category: 'Analysis' },
  { id: 'disconnection_reason', name: 'Disconnection Reason', type: 'enum', description: 'How the call ended', category: 'Core' },
  { id: 'direction', name: 'Call Direction', type: 'enum', description: 'Inbound or outbound call', category: 'Core' },
  { id: 'call_analysis.user_sentiment', name: 'User Sentiment', type: 'enum', description: 'Customer sentiment during call', category: 'Analysis' },
  { id: 'call_analysis.call_outcome', name: 'Call Outcome', type: 'enum', description: 'Overall outcome of the call', category: 'Analysis' },
  
  // Cost data
  { id: 'call_cost.combined_cost', name: 'Call Cost', type: 'number', description: 'Total cost of the call', category: 'Cost' },
  { id: 'call_cost.total_duration_seconds', name: 'Billable Duration', type: 'number', description: 'Billable duration in seconds', category: 'Cost' },
  
  // Technical
  { id: 'disconnection_reason', name: 'Disconnection Reason', type: 'string', description: 'Why the call ended', category: 'Technical' },
]

const CRM_FIELDS = {
  pipedrive: [
    // Person fields
    { id: 'person.id', name: 'Person ID', type: 'number', category: 'Person', description: 'Unique person identifier for linking' },
    { id: 'person.name', name: 'Person Name', type: 'string', category: 'Person' },
    { id: 'person.first_name', name: 'Person First Name', type: 'string', category: 'Person' },
    { id: 'person.last_name', name: 'Person Last Name', type: 'string', category: 'Person' },
    { id: 'person.phones[0].value', name: 'Person Phone', type: 'string', category: 'Person' },
    { id: 'person.emails[0].value', name: 'Person Email', type: 'string', category: 'Person' },
    { id: 'person.notes', name: 'Person Notes', type: 'text', category: 'Person' },
    { id: 'person.job_title', name: 'Person Job Title', type: 'string', category: 'Person' },
    { id: 'person.owner_id', name: 'Person Owner ID', type: 'number', category: 'Person', description: 'Assigned user ID' },
    
    // Deal fields
    { id: 'deal.id', name: 'Deal ID', type: 'number', category: 'Deal', description: 'Unique deal identifier for linking' },
    { id: 'deal.title', name: 'Deal Title', type: 'string', category: 'Deal' },
    { id: 'deal.value', name: 'Deal Value', type: 'number', category: 'Deal' },
    { id: 'deal.currency', name: 'Deal Currency', type: 'string', category: 'Deal' },
    { id: 'deal.stage_id', name: 'Deal Stage ID', type: 'string', category: 'Deal' },
    { id: 'deal.pipeline_id', name: 'Deal Pipeline ID', type: 'number', category: 'Deal' },
    { id: 'deal.status', name: 'Deal Status', type: 'string', category: 'Deal' },
    { id: 'deal.person_id', name: 'Deal Person ID', type: 'number', category: 'Deal', description: 'Link deal to person' },
    { id: 'deal.org_id', name: 'Deal Organization ID', type: 'number', category: 'Deal', description: 'Link deal to organization' },
    { id: 'deal.owner_id', name: 'Deal Owner ID', type: 'number', category: 'Deal', description: 'Assigned user ID' },
    { id: 'deal.expected_close_date', name: 'Expected Close Date', type: 'date', category: 'Deal' },
    { id: 'deal.probability', name: 'Deal Probability', type: 'number', category: 'Deal' },
    { id: 'deal.lost_reason', name: 'Lost Reason', type: 'string', category: 'Deal' },
    
    // Activity fields
    { id: 'activity.id', name: 'Activity ID', type: 'number', category: 'Activity', description: 'Unique activity identifier' },
    { id: 'activity.subject', name: 'Activity Subject', type: 'string', category: 'Activity' },
    { id: 'activity.type', name: 'Activity Type', type: 'string', category: 'Activity' },
    { id: 'activity.note', name: 'Activity Notes', type: 'text', category: 'Activity' },
    { id: 'activity.due_date', name: 'Activity Due Date', type: 'date', category: 'Activity' },
    { id: 'activity.due_time', name: 'Activity Due Time', type: 'string', category: 'Activity' },
    { id: 'activity.duration', name: 'Activity Duration', type: 'string', category: 'Activity' },
    { id: 'activity.location', name: 'Activity Location', type: 'string', category: 'Activity' },
    { id: 'activity.done', name: 'Activity Done', type: 'boolean', category: 'Activity' },
    { id: 'activity.person_id', name: 'Activity Person ID', type: 'number', category: 'Activity', description: 'Link activity to person' },
    { id: 'activity.deal_id', name: 'Activity Deal ID', type: 'number', category: 'Activity', description: 'Link activity to deal' },
    { id: 'activity.org_id', name: 'Activity Organization ID', type: 'number', category: 'Activity', description: 'Link activity to organization' },
    { id: 'activity.owner_id', name: 'Activity Owner ID', type: 'number', category: 'Activity', description: 'Assigned user ID' },
  ],
  hubspot: [
    { id: 'contact_firstname', name: 'First Name', type: 'string' },
    { id: 'contact_phone', name: 'Phone Number', type: 'string' },
    { id: 'deal_name', name: 'Deal Name', type: 'string' },
    { id: 'deal_amount', name: 'Deal Amount', type: 'number' },
    { id: 'dealstage', name: 'Deal Stage', type: 'string' },
    { id: 'call_notes', name: 'Call Notes', type: 'text' },
    { id: 'task_date', name: 'Task Date', type: 'date' },
  ],
  salesforce: [
    { id: 'FirstName', name: 'First Name', type: 'string' },
    { id: 'Phone', name: 'Phone', type: 'string' },
    { id: 'Opportunity_Name', name: 'Opportunity Name', type: 'string' },
    { id: 'Amount', name: 'Amount', type: 'number' },
    { id: 'StageName', name: 'Stage Name', type: 'string' },
    { id: 'Description', name: 'Description', type: 'text' },
    { id: 'ActivityDate', name: 'Activity Date', type: 'date' },
  ],
  zoho: [
    { id: 'Full_Name', name: 'Full Name', type: 'string' },
    { id: 'Phone', name: 'Phone', type: 'string' },
    { id: 'Deal_Name', name: 'Deal Name', type: 'string' },
    { id: 'Amount', name: 'Amount', type: 'number' },
    { id: 'Stage', name: 'Stage', type: 'string' },
    { id: 'Description', name: 'Description', type: 'text' },
    { id: 'Closing_Date', name: 'Closing Date', type: 'date' },
  ],
}

const Step: React.FC<StepProps> = ({ title, description, isActive, isCompleted, stepNumber }) => (
  <div className={`flex items-center ${isActive ? 'text-primary-600' : isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
      isActive ? 'bg-primary-100 text-primary-600' : 
      isCompleted ? 'bg-green-100 text-green-600' : 
      'bg-gray-100 text-gray-400'
    }`}>
      {isCompleted ? <CheckIcon className="w-5 h-5" /> : stepNumber}
    </div>
    <div className="ml-4">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs">{description}</div>
    </div>
  </div>
)

// MVP Business Logic: Pre-built workflows based on integration type
function getMVPActionsForType(integrationType: string): WorkflowAction[] {
  const baseActions: WorkflowAction[] = []
  
  if (integrationType === 'inbound' || integrationType === 'both') {
    // Inbound calls: Handle customer inquiries, support, and bookings
    return [
      {
        type: 'create_person',
        crmObject: 'person',
        fields: {
          name: '{{call.call_analysis.retell_llm_dynamic_variables.customer_full_name}}',
          phone: '{{call.call_analysis.retell_llm_dynamic_variables.customer_phone}}',
          email: '{{call.call_analysis.retell_llm_dynamic_variables.customer_email}}'
        }
      },
      {
        type: 'conditional_action',
        crmObject: 'deal',
        conditions: 'call_successful === true',
        fields: {
          title: 'Inbound Call - {{call.call_analysis.retell_llm_dynamic_variables.customer_full_name}}',
          person_id: '{{previous_action_result.id}}',
          value: '{{call.call_analysis.custom_analysis_data.deal_value}}',
          status: 'open'
        }
      },
      {
        type: 'create_activity',
        crmObject: 'activity',
        fields: {
          subject: '{{call.call_analysis.in_voicemail}} === true ? "Voicemail - Call Not Answered" : "Inbound Call"',
          type: 'call',
          person_id: '{{action_0_result.id}}',
          deal_id: '{{action_1_result.id}}',
          note: 'Call Summary: {{call.call_analysis.call_summary}}\n\nCall Analysis: {{call.call_analysis.custom_analysis_data}}',
          done: true
        }
      }
    ]
  }
  
  if (integrationType === 'outbound') {
    // Outbound calls: Qualify leads, book appointments, follow-ups
    return [
      {
        type: 'create_person',
        crmObject: 'person',
        fields: {
          name: '{{call.call_analysis.retell_llm_dynamic_variables.customer_full_name}}',
          phone: '{{call.call_analysis.retell_llm_dynamic_variables.customer_phone}}',
          email: '{{call.call_analysis.retell_llm_dynamic_variables.customer_email}}'
        }
      },
      {
        type: 'conditional_action',
        crmObject: 'deal',
        conditions: 'call_successful === true',
        fields: {
          title: 'Outbound Call - {{call.call_analysis.retell_llm_dynamic_variables.customer_full_name}}',
          person_id: '{{previous_action_result.id}}',
          value: '{{call.call_analysis.custom_analysis_data.deal_value}}',
          status: 'open'
        }
      },
      {
        type: 'create_activity',
        crmObject: 'activity',
        fields: {
          subject: '{{call.call_analysis.in_voicemail}} === true ? "Voicemail - Follow-up Required" : "Outbound Call"',
          type: 'call',
          person_id: '{{action_0_result.id}}',
          deal_id: '{{action_1_result.id}}',
          note: 'Call Summary: {{call.call_analysis.call_summary}}\n\nCall Analysis: {{call.call_analysis.custom_analysis_data}}',
          done: true
        }
      }
    ]
  }
  
  // Default fallback - just log the call
  return [
    {
      type: 'create_activity',
      crmObject: 'activity',
      fields: {
        subject: 'Call Log',
        type: 'call',
        note: 'Call Summary: {{call.call_analysis.call_summary}}',
        done: true
      }
    }
  ]
}

export default function IntegrationWizardPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEditing = Boolean(id)
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  
  const [currentStep, setCurrentStep] = useState(0)
  const [renderKey, setRenderKey] = useState(0)
  const [isEditingDraft, setIsEditingDraft] = useState(false)
  
  // Debug currentStep changes
  // Temporarily disabled to fix refresh loop
  // useEffect(() => {
  //   console.log(`📍 currentStep changed to: ${currentStep} (${STEPS[currentStep]?.title})`)
  //   // Force a small delay to ensure React processes the state change
  //   setTimeout(() => {
  //     console.log(`📍 Step render confirmed: ${currentStep}`)
  //   }, 100)
  // }, [currentStep])
  
  const [showWorkflowModal, setShowWorkflowModal] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState<BusinessWorkflow | null>(null)
  const [retellApiKey, setRetellApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Load user accounts to auto-populate API keys
  const { data: userAccounts } = useQuery({
    queryKey: ['user-accounts'],
    queryFn: async () => {
      const response = await api.get('/accounts')
      return response.data.data
    },
    enabled: !!user?.id, // Only fetch when user is available
  })
  
  const [savedState, setSavedState] = useState<any>(null)
  const [isRestoringState, setIsRestoringState] = useState(true) // Prevent saving during restoration
  const [hasInitialized, setHasInitialized] = useState(false) // Prevent multiple initializations
  const [crmSchema, setCrmSchema] = useState<any>(null)
  const [config, setConfig] = useState<IntegrationConfig>({
    name: '',
    description: '',
    retellAccountId: '',
    selectedAgentId: '',
    crmProvider: '',
    crmAccountId: '',
    integrationType: 'both',
    selectedGoal: undefined, // Explicitly set to undefined initially
    businessWorkflows: [],
    fieldMappings: [],
    webhookUrl: '',
    syncFrequency: 'realtime',
    enabled: true,
    discoveredFields: [...STANDARD_RETELL_FIELDS],
    lastWebhookSample: null,
    availableAgents: [],
  })

  // Auto-populate Retell API key from existing accounts
  useEffect(() => {
    const isContinuingDraft = window.location.pathname.includes('/continue')
    
    console.log('🔍 Checking for auto-population:', {
      userAccounts: userAccounts?.length || 0,
      retellApiKey: !!retellApiKey,
      isRestoringState,
      isContinuingDraft,
      accounts: userAccounts
    })
    
    // Skip auto-population during draft loading to prevent config override
    if (isContinuingDraft && isRestoringState) {
      console.log('⏭️ Skipping auto-population during draft loading')
      return
    }
    
    if (userAccounts && userAccounts.length > 0 && !retellApiKey) {
      const retellAccount = userAccounts.find((account: any) => 
        account.provider === 'retell' && account.providerType === 'voice_ai' && account.isActive
      )
      
      console.log('🔍 Found Retell account:', retellAccount)
      
      if (retellAccount && retellAccount.accessToken) {
        console.log('✅ Auto-populating Retell API key from existing account')
        setRetellApiKey(retellAccount.accessToken)
        setConfig(prev => ({ ...prev, retellAccountId: retellAccount.id }))
      } else {
        console.log('❌ No Retell account found or missing access token')
      }
    }
  }, [userAccounts, retellApiKey, isRestoringState])

  // Fetch agents when API key gets auto-populated or manually entered
  useEffect(() => {
    console.log('🔍 Agent fetching useEffect triggered:', {
      retellApiKey: !!retellApiKey,
      retellAccountId: config.retellAccountId,
      availableAgentsCount: config.availableAgents?.length || 0,
      isLoading,
      isRestoringState
    })
    
    // Don't fetch agents when loading a draft or during initialization
    const isDraftLoading = window.location.pathname.includes('continue')
    const isInitializing = localStorage.getItem('wizard_currently_initializing')
    
    const shouldFetchAgents = (
      retellApiKey && 
      retellApiKey.startsWith('key_') && 
      config.retellAccountId && 
      config.availableAgents.length === 0 &&
      !isLoading &&
      !isDraftLoading &&
      !isInitializing &&
      !isRestoringState
    )

    if (shouldFetchAgents) {
      console.log('🔄 API key ready - fetching agents automatically...')
      const fetchAgents = async () => {
        try {
          setIsLoading(true)
          await fetchAvailableAgents(retellApiKey)
        } catch (error) {
          console.error('Failed to fetch agents after auto-population:', error)
          setIsLoading(false)
        }
      }
      
      // Small delay to ensure state is stable
      setTimeout(fetchAgents, 50)
    }
  }, [retellApiKey, config.retellAccountId, config.availableAgents?.length || 0, isLoading, isRestoringState])

  // Debug config changes to see UI state
  useEffect(() => {
    console.log('🔧 Config state updated:', {
      selectedGoal: config.selectedGoal,
      crmProvider: config.crmProvider,
      crmAccountId: config.crmAccountId,
      retellAccountId: config.retellAccountId,
      selectedAgentId: config.selectedAgentId,
      hasValidCrmConnection: !!config.crmAccountId && !!config.crmProvider
    })
  }, [config.crmProvider, config.crmAccountId, config.retellAccountId, config.selectedAgentId])

  // Load saved wizard state on mount - ONLY RUN ONCE
  useEffect(() => {
    // Use localStorage to prevent multiple initializations across component remounts
    const initKey = 'wizard_init_' + Date.now()
    const existingInit = localStorage.getItem('wizard_currently_initializing')
    
    if (existingInit && (Date.now() - parseInt(existingInit)) < 5000) {
      console.log('⚠️ Another initialization in progress - skipping to prevent race condition')
      return
    }
    
    const loadSavedState = async () => {
      try {
        console.log('🚀 Starting state initialization (first time only)')
        localStorage.setItem('wizard_currently_initializing', Date.now().toString())
        setHasInitialized(true) // Mark as initialized immediately
        
        // Check if this is a new integration (coming from "New Integration" button)
        const urlParams = new URLSearchParams(window.location.search)
        const isNewIntegration = urlParams.get('new') === 'true'
        
        // TEMPORARY: Force clear cache to regenerate mappings with fixed rules
        const cacheTimestamp = localStorage.getItem('mapping_rules_version')
        const currentVersion = '2025-08-24-comprehensive'
        if (cacheTimestamp !== currentVersion) {
          console.log('🔄 Mapping rules updated - clearing cache to regenerate with new rules')
          localStorage.removeItem('integrationWizardState')
          localStorage.removeItem('integration_wizard_state')
          localStorage.setItem('mapping_rules_version', currentVersion)
          setTimeout(() => {
            localStorage.removeItem('wizard_currently_initializing')
          }, 100)
          window.location.reload()
          return
        }
        
        // Check if this is continuing a draft integration or editing a published integration
        const isContinuingDraft = window.location.pathname.includes('/continue')
        const isEditingIntegration = window.location.pathname.includes('/edit')
        const integrationId = id
        
        if ((isContinuingDraft || isEditingIntegration) && integrationId) {
          console.log('🔄 Loading integration:', integrationId, isContinuingDraft ? '(draft)' : '(published)')
          try {
            const response = await api.get(`/integrations/${integrationId}`)
            const integrationData = response.data.data
            
            if (isContinuingDraft && !integrationData.isDraft) {
              console.error('❌ Integration is not a draft')
              toast.error('This integration is not a draft')
              navigate('/integrations')
              return
            }
            
            // Set the draft editing state
            setIsEditingDraft(integrationData.isDraft)
            
            console.log('✅ Integration loaded:', integrationData)
            
            // Check for cached agents in localStorage to avoid re-fetching
            const cachedState = localStorage.getItem('integrationWizardState')
            const cachedAgents = cachedState ? JSON.parse(cachedState)?.config?.availableAgents || [] : []
            
            // Map draft data to wizard config
            const restoredConfig = {
              name: integrationData.name || '',
              description: integrationData.description || '',
              retellAccountId: integrationData.retellAccountId || '',
              crmAccountId: integrationData.crmAccountId || '',
              selectedAgentId: integrationData.retellAgentId || '',
              crmProvider: integrationData.crmAccount?.provider || 'pipedrive',
              integrationType: integrationData.integrationType || 'both',
              selectedPipelineId: integrationData.callConfiguration?.selectedPipelineId || '',
              selectedStageId: integrationData.callConfiguration?.selectedStageId || '',
              fieldMappings: (integrationData.fieldMappings || []).map((mapping: any) => ({
                sourceField: mapping.retellField,
                targetField: mapping.crmField,
                transform: mapping.transform,
                required: mapping.required
              })),
              businessWorkflows: Array.isArray(integrationData.businessWorkflows) ? integrationData.businessWorkflows : [],
              webhookUrl: integrationData.webhookUrl || '',
              syncFrequency: 'immediate',
              enabled: false,
              integrationSaved: !integrationData.isDraft, // Published integrations are already saved
              draftId: integrationData.isDraft ? integrationData.id : null,
              availableAgents: cachedAgents, // Use cached agents if available
              discoveredFields: [...STANDARD_RETELL_FIELDS], // Load standard fields for display
              selectedGoal: ''
            }
            
            console.log('🔄 Integration config restored:', restoredConfig)
            setConfig(restoredConfig)
            
            // Set the Retell API key from the associated account to prevent auto-population
            if (integrationData.retellAccount?.accessToken) {
              setRetellApiKey(integrationData.retellAccount.accessToken)
            } else if (userAccounts) {
              const retellAccount = userAccounts.find((account: any) => 
                account.id === integrationData.retellAccountId
              )
              if (retellAccount?.accessToken) {
                setRetellApiKey(retellAccount.accessToken)
              }
            }
            
            // For published integrations, always go to final step (4)
            // For drafts, use saved currentStep or determine from data
            let startStep = 4 // Default to final step for published integrations
            
            if (integrationData.isDraft) {
              startStep = integrationData.currentStep !== undefined ? integrationData.currentStep : 0
              
              // If no saved step, fall back to determining from data (for old drafts without currentStep)
              if (integrationData.currentStep === undefined) {
                console.log('⚠️ No saved currentStep found, determining from data (legacy draft)')
                
                // Step 0: Basic info - name and description (always complete if we have a draft)
                if (restoredConfig.name) {
                  startStep = 1
                }
                
                // Step 1: Account connections - need BOTH retell and CRM accounts
                if (restoredConfig.retellAccountId && restoredConfig.crmAccountId) {
                  startStep = 2
                }
                
                // Step 2: Agent selection - need agent selected AND available agents populated
                if (restoredConfig.selectedAgentId && restoredConfig.availableAgents && restoredConfig.availableAgents.length > 0) {
                  startStep = 3
                }
                
                // Step 3: Pipeline/stage configuration - need BOTH pipeline and stage
                if (restoredConfig.selectedPipelineId && restoredConfig.selectedStageId) {
                  startStep = 3 // Stay at Pipeline Selection step (step 3)
                }
              }
            }
            
            console.log(`🎯 Determined start step: ${startStep} ${integrationData.isDraft ? '(draft)' : '(published)'} - ${integrationData.currentStep !== undefined ? 'saved step' : 'calculated from data'}`)
            setCurrentStep(startStep)
            
            const actionType = integrationData.isDraft ? 'Continuing setup of' : 'Editing'
            toast.success(`📝 ${actionType} "${integrationData.name}"`)
            setTimeout(() => {
              localStorage.removeItem('wizard_currently_initializing')
            }, 100)
            return
            
          } catch (error: any) {
            console.error('❌ Failed to load draft integration:', error)
            toast.error('Failed to load draft integration')
            navigate('/integrations')
            return
          }
        }
        
        if (isNewIntegration) {
          console.log('🆕 New integration detected - clearing previous state')
          localStorage.removeItem('integrationWizardState')
          localStorage.removeItem('integration_wizard_state')
          // Clear the URL parameter to avoid re-clearing on refresh
          window.history.replaceState({}, '', window.location.pathname)
          // Start with fresh state and allow agent fetching immediately
          setIsRestoringState(false)
          localStorage.removeItem('wizard_currently_initializing')
          return
        }
        
        const saved = localStorage.getItem('integrationWizardState')
        console.log('🔍 Checking localStorage for saved state:', saved)
        
        // Get OAuth params from current URL
        const currentUrl = new URL(window.location.href)
        // Handle both old format (connected, account_id) and new format (provider, accountId)
        const oauthReturn = currentUrl.searchParams.get('connected') || currentUrl.searchParams.get('provider')
        const accountId = currentUrl.searchParams.get('account_id') || currentUrl.searchParams.get('accountId')
        const isSuccess = currentUrl.searchParams.get('success') === 'account_connected'
        
        if (saved) {
          const parsedState = JSON.parse(saved)
          setSavedState(parsedState)
          
          console.log('📦 RAW localStorage:', saved)
          console.log('📦 PARSED state:', parsedState)
          console.log('📦 Restoring saved state:', {
            savedStep: parsedState.currentStep,
            hasApiKey: !!parsedState.retellApiKey,
            hasConfig: !!parsedState.config,
            configStep: parsedState.config?.currentStep,
            oauthReturn,
            accountId
          })
          
          if ((oauthReturn && accountId) || isSuccess) {
            console.log(`🔗 OAuth return detected for ${oauthReturn}, account: ${accountId}`)
            
            // Restore state with OAuth connection update
            const updatedConfig = {
              ...(parsedState.config || {}),
              crmAccountId: accountId,
              crmProvider: oauthReturn
            }
            
            console.log(`✅ OAuth state updated:`, {
              previousCrmAccountId: parsedState.config?.crmAccountId || 'empty',
              newCrmAccountId: accountId,
              crmProvider: oauthReturn
            })
            
            // Restore everything at once to avoid race conditions
            console.log(`🔄 BEFORE setState - parsedState.currentStep: ${parsedState.currentStep}`)
            
            const targetStep = parsedState.currentStep || 0
            const targetStepDisplay = targetStep + 1
            
            // FORCE the state restoration with multiple attempts
            setConfig(updatedConfig)
            setRetellApiKey(parsedState.retellApiKey || '')
            setCurrentStep(targetStep)
            setIsLoading(parsedState.isLoading || false)
            
            // Force step restoration again after a delay to override any other effects
            setTimeout(() => {
              console.log(`🔧 FORCING step restoration to: ${targetStep}`)
              setCurrentStep(targetStep)
            }, 50)
            
            // And one more time to be absolutely sure
            setTimeout(() => {
              console.log(`🔧 FINAL step restoration to: ${targetStep}`)
              setCurrentStep(targetStep)
              
              // State restoration is complete - allow saving again
              setTimeout(() => {
                console.log('✅ State restoration complete - enabling save')
                setIsRestoringState(false)
                localStorage.removeItem('wizard_currently_initializing') // Clear init lock
              }, 100)
            }, 200)
            
            toast.success(`🔗 ${oauthReturn} connected! Returning to Step ${targetStepDisplay}`)
            
            console.log(`✅ State restoration initiated: step ${targetStep}, API key: ${!!parsedState.retellApiKey}, agents: ${parsedState.config?.availableAgents?.length || 0}`)
            console.log('🔗 CRM connection after OAuth restoration:', {
              crmProvider: updatedConfig.crmProvider,
              crmAccountId: updatedConfig.crmAccountId,
              retellAccountId: updatedConfig.retellAccountId,
              selectedAgentId: updatedConfig.selectedAgentId
            })
            
            // Clean up URL parameters
            currentUrl.searchParams.delete('connected')
            currentUrl.searchParams.delete('account_id')
            window.history.replaceState({}, '', currentUrl.toString())
            
          } else {
            // Normal state restoration (no OAuth)
            setConfig(parsedState.config || {})
            setRetellApiKey(parsedState.retellApiKey || '')
            // Ensure currentStep is restored and not reset
            const restoredStep = parsedState.currentStep || 0
            setCurrentStep(restoredStep)
            setIsLoading(false) // Always start with loading = false on page load
            
            // Force currentStep to stay at restored value after a delay to prevent race conditions
            setTimeout(() => {
              console.log(`🔒 Ensuring currentStep stays at restored value: ${restoredStep}`)
              setCurrentStep(restoredStep)
            }, 200)
            
            console.log(`✅ State restored normally: step ${parsedState.currentStep}, API key: ${!!parsedState.retellApiKey}`)
            
            // Only fetch agents if they don't exist at all - no automatic re-fetching
            const hasNoAgents = !parsedState.config?.availableAgents || parsedState.config.availableAgents.length === 0
            const hasValidConnection = parsedState.retellApiKey && parsedState.config?.retellAccountId
            const hasValidApiKey = parsedState.retellApiKey && parsedState.retellApiKey.startsWith('key_')
            
            if (hasNoAgents && hasValidConnection && hasValidApiKey) {
              console.log('🔄 No cached agents found - fetching from API...')
              setTimeout(async () => {
                try {
                  setIsLoading(true)
                  await fetchAvailableAgents(parsedState.retellApiKey)
                } catch (error) {
                  console.error('Failed to fetch agents:', error)
                  setIsLoading(false)
                }
              }, 500)
            } else if (parsedState.config?.availableAgents?.length > 0) {
              console.log(`✅ Using ${parsedState.config.availableAgents.length} cached agents - no re-fetch needed`)
              // Agents are already loaded, no need to show loading state
              setIsLoading(false)
            }
            
            // Allow saving after normal restoration
            setTimeout(() => {
              console.log('✅ Normal state restoration complete - enabling save')
              setIsRestoringState(false)
              localStorage.removeItem('wizard_currently_initializing') // Clear init lock
            }, 100)
          }
        } else {
          console.log('📝 No saved state found - starting fresh')
          // No state to restore - allow saving immediately
          setIsRestoringState(false)
          localStorage.removeItem('wizard_currently_initializing') // Clear init lock
        }
      } catch (error) {
        console.error('❌ Failed to load saved state:', error)
      }
    }
    
    loadSavedState().catch(console.error)
  }, []) // Only run once on mount - no dependencies to avoid multiple runs

  // Save wizard state whenever it changes (but NOT during restoration)
  useEffect(() => {
    if (isRestoringState) {
      console.log('🚫 Skipping save during state restoration')
      return
    }
    
    const stateToSave = {
      config,
      currentStep,
      retellApiKey,
      isLoading,
      timestamp: Date.now()
    }
    console.log('💾 Saving state to localStorage:', stateToSave)
    localStorage.setItem('integrationWizardState', JSON.stringify(stateToSave))
  }, [config, currentStep, retellApiKey, isLoading, isRestoringState])

  // Clear outcome workflows when goal changes (users will manually add them)
  useEffect(() => {
    if (config.selectedGoal && !isRestoringState) {
      // Remove all existing outcome workflows when goal changes
      const nonOutcomeWorkflows = config.businessWorkflows.filter(workflow => 
        !['goal-achieved', 'goal-not-achieved', 'no-answer-voicemail', 'custom-outcome'].some(outcomeId => 
          workflow.id.includes(outcomeId)
        )
      )
      
      // Only clear if we actually have outcome workflows to remove
      if (nonOutcomeWorkflows.length !== config.businessWorkflows.length) {
        console.log('🎯 Clearing outcome templates for new goal:', config.selectedGoal)
        setConfig(prev => ({
          ...prev,
          businessWorkflows: nonOutcomeWorkflows
        }))
      }
    }
  }, [config.selectedGoal, isRestoringState])

  // Fetch CRM schema when CRM account is connected
  useEffect(() => {
    if (config.crmAccountId) {
      console.log(`🔍 Fetching CRM schema for account: ${config.crmAccountId} (isRestoringState: ${isRestoringState})`)
      fetchCrmSchema()
    } else if (config.crmProvider && !config.crmAccountId && !isRestoringState) {
      console.warn(`⚠️ CRM provider ${config.crmProvider} is set but crmAccountId is empty - this might be a sync issue`)
    }
  }, [config.crmAccountId, config.crmProvider])

  // Auto-discover fields when agent is selected and we're on field mapping step (step 3 = 4th step in UI)
  useEffect(() => {
    console.log('🔍 Auto-discovery check:', {
      hasSelectedAgent: !!config.selectedAgentId,
      currentStep,
      discoveredFieldsCount: config.discoveredFields?.length || 0,
      isRestoringState,
      selectedAgentId: config.selectedAgentId
    })
    
    if (config.selectedAgentId && currentStep === 3 && !isRestoringState) {
      console.log(`🔍 Auto-discovering fields for selected agent: ${config.selectedAgentId} on Field Mapping step`)
      console.log(`📊 Current discovered fields:`, config.discoveredFields)
      
      // Always fetch fresh data for the latest call
      if ((config.discoveredFields?.length || 0) === 0) {
        console.log(`🆕 No fields discovered yet, fetching from agent...`)
        discoverFieldsFromAgent(config.selectedAgentId)
      } else {
        console.log(`🔄 Fields exist but forcing fresh fetch from latest call...`)
        discoverFieldsFromAgent(config.selectedAgentId)
      }
    }
  }, [config.selectedAgentId, currentStep, isRestoringState])

  // Auto-generate mappings when fields are discovered and CRM schema is available
  useEffect(() => {
    if ((config.discoveredFields?.length || 0) > 0 && crmSchema && !isRestoringState) {
      console.log(`🤖 Auto-generating mappings for ${config.discoveredFields?.length || 0} discovered fields (current mappings: ${config.fieldMappings?.length || 0})`)
      generateAutoMappings(crmSchema, true) // Force generation even if mappings exist
    }
  }, [config.discoveredFields?.length || 0, crmSchema, isRestoringState])

  const fetchCrmSchema = async () => {
    if (!config.crmAccountId) return
    
    try {
      console.log('🔍 Fetching CRM schema for account:', config.crmAccountId)
      const response = await api.get(`/crm/${config.crmAccountId}/schema`)
      
      if (response.data.success) {
        setCrmSchema(response.data.data.schema)
        console.log('✅ CRM schema fetched:', response.data.data.schema)
        
        // Auto-populate obvious field mappings only if we have discovered fields
        if ((config.discoveredFields?.length || 0) > 0) {
          generateAutoMappings(response.data.data.schema)
        }
      }
    } catch (error) {
      console.error('❌ Failed to fetch CRM schema:', error)
    }
  }

  // Generate field mappings based on actual working webhook processor flows
  const generateAutoMappings = (schema: any, force = false) => {
    if (!schema || (!force && (config.fieldMappings?.length || 0) > 0)) return // Don't overwrite existing mappings unless forced
    
    console.log('🤖 Generating field mappings based on actual working webhook processor flows...')
    console.log('🔍 Available schema:', { 
      stages: schema.stages?.length, 
      dealFields: schema.dealFields?.length, 
      personFields: schema.personFields?.length 
    })
    
    const autoMappings: FieldMapping[] = []
    
    // Create actual working field mappings that match the webhook processor logic
    const actualWorkingMappings = [
      // PHONE CONTACT MANAGEMENT FLOW (webhookProcessor.ts:652-720)
      // This searches for existing contacts by phone and creates new ones if not found
      {
        sourceField: 'from_number',
        targetField: 'person.phone',
        required: true,
        source: 'webhook_processor',
        transform: 'phone_format',
        description: 'Phone number for contact lookup/creation (Inbound calls)'
      },
      {
        sourceField: 'to_number', 
        targetField: 'person.phone',
        required: true,
        source: 'webhook_processor',
        transform: 'phone_format',
        description: 'Phone number for contact lookup/creation (Outbound calls)'
      },
      {
        sourceField: 'retell_llm_dynamic_variables.name',
        targetField: 'person.name',
        required: false,
        source: 'webhook_processor',
        description: 'Contact name from Retell dynamic variables'
      },
      {
        sourceField: 'retell_llm_dynamic_variables.phone',
        targetField: 'person.phone',
        required: false,
        source: 'webhook_processor',
        transform: 'phone_format',
        description: 'Phone number from Retell dynamic variables'
      },
      {
        sourceField: 'retell_llm_dynamic_variables.email',
        targetField: 'person.email', 
        required: false,
        source: 'webhook_processor',
        description: 'Email from Retell dynamic variables'
      },
      
      // CALL ACTIVITY CREATION FLOW (webhookProcessor.ts:622-629)
      // This creates activities with formatted transcripts and call details
      {
        sourceField: 'transcript',
        targetField: 'activity.note',
        required: true,
        source: 'webhook_processor',
        description: 'Formatted call transcript with agent/user labeling'
      },
      {
        sourceField: 'recording_url',
        targetField: 'activity.note',
        required: false,
        source: 'webhook_processor', 
        description: 'Recording URL embedded in activity note'
      },
      {
        sourceField: 'duration_ms',
        targetField: 'activity.note',
        required: false,
        source: 'webhook_processor',
        transform: 'none',
        description: 'Call duration formatted in minutes and seconds'
      },
      {
        sourceField: 'direction',
        targetField: 'activity.subject',
        required: false,
        source: 'webhook_processor',
        description: 'Inbound/Outbound call direction in subject'
      },
      
      // VOICEMAIL DETECTION FLOW (webhookProcessor.ts:582-590)
      // Special handling when call goes to voicemail
      {
        sourceField: 'call_analysis.in_voicemail',
        targetField: 'activity.subject',
        required: false,
        source: 'webhook_processor',
        booleanValue: true,
        description: 'Voicemail detection - creates "Call not answered" activity'
      },
      
      // DEAL CREATION ON SUCCESS FLOW (webhookProcessor.ts:631-642)
      // Creates deals only when call is successful
      {
        sourceField: 'call_analysis.call_successful',
        targetField: 'deal.create',
        required: false,
        source: 'webhook_processor',
        booleanValue: true,
        description: 'Creates deal when call is successful'
      },
      {
        sourceField: 'retell_llm_dynamic_variables.procedure',
        targetField: 'deal.title',
        required: false,
        source: 'webhook_processor',
        description: 'Procedure/service type for deal title'
      }
    ]
    
    console.log(`📋 Generated ${actualWorkingMappings.length} field mappings from actual webhook processor flows`)
    
    // Filter mappings to only show fields that exist in discovered fields
    const matchedMappings = actualWorkingMappings.filter(mapping => {
      // Check if the source field exists in discovered fields
      const fieldExists = config.discoveredFields.some(field => {
        return field.id === mapping.sourceField || field.name === mapping.sourceField
      })
      
      if (!fieldExists) {
        console.log(`⚠️ Skipping mapping for "${mapping.sourceField}" - field not found in discovered fields`)
      }
      
      return fieldExists
    })
    
    console.log(`✅ Matched ${matchedMappings.length} mappings with discovered fields`)
    
    // Add the working field mappings
    autoMappings.push(...matchedMappings)
    
    // Apply auto-mappings if any were found
    if (autoMappings.length > 0) {
      setConfig(prev => ({
        ...prev,
        fieldMappings: force ? autoMappings : [...prev.fieldMappings, ...autoMappings]
      }))
      console.log(`🎉 Generated ${autoMappings.length} automatic field mappings`)
      toast.success(`🤖 Generated ${autoMappings.length} working field mappings!`)
    } else {
      if (force) {
        toast('No working field mappings found. Try discovering fields from your agent first.')
      }
    }
  }

  // Check if a Pipedrive field exists in the schema
  const isValidPipedriveField = (fieldPath: string, schema: any): boolean => {
    if (fieldPath.startsWith('person.')) {
      const fieldKey = fieldPath.replace('person.', '')
      return schema.personFields?.some((f: any) => f.key === fieldKey)
    }
    if (fieldPath.startsWith('deal.')) {
      const fieldKey = fieldPath.replace('deal.', '').split('.')[0] // Handle deal.stage_id.123
      return schema.dealFields?.some((f: any) => f.key === fieldKey) || fieldKey === 'stage_id'
    }
    if (fieldPath.startsWith('activity.')) {
      // Activity fields are generally available
      return true
    }
    return false
  }

  // Suggest appropriate transformation based on field types
  const suggestTransformation = (retellField: any, pipedriveField: string): string | undefined => {
    // Phone formatting
    if (pipedriveField.includes('phone') && retellField.type === 'string') {
      return 'phone_format'
    }

    // Name capitalization
    if (pipedriveField.includes('name') && retellField.type === 'string') {
      return 'capitalize'
    }

    return undefined
  }

  // Generate dynamic CRM field options based on fetched schema
  // Helper function to check if a field needs two-level selection
  const needsTwoLevelSelection = (fieldType: string) => {
    return fieldType === 'activity' || fieldType === 'deal.pipeline' || fieldType === 'person.contact'
  }

  // Helper function to get level 1 options (activity types, pipelines, contact types)
  const getLevel1Options = (fieldType: string) => {
    if (fieldType === 'activity' && crmSchema?.activityTypes) {
      return crmSchema.activityTypes.map((type: any) => ({
        id: type.key_string || type.id,
        name: type.name,
        value: type.id
      }))
    }
    if (fieldType === 'deal.pipeline' && crmSchema?.pipelines) {
      return crmSchema.pipelines.map((pipeline: any) => ({
        id: pipeline.id,
        name: pipeline.name,
        value: pipeline.id
      }))
    }
    if (fieldType === 'person.contact') {
      return [
        { id: 'emails', name: 'Email Addresses', value: 'emails' },
        { id: 'phones', name: 'Phone Numbers', value: 'phones' }
      ]
    }
    return []
  }

  // Helper function to get level 2 options (activity fields, stages, email/phone types)
  const getLevel2Options = (fieldType: string, level1Value: string) => {
    if (fieldType === 'activity') {
      return [
        { id: 'note', name: 'Note', value: 'note' },
        { id: 'subject', name: 'Subject', value: 'subject' },
        { id: 'duration', name: 'Duration', value: 'duration' },
        { id: 'person_id', name: 'Contact', value: 'person_id' },
        { id: 'deal_id', name: 'Deal', value: 'deal_id' },
        { id: 'due_date', name: 'Due Date', value: 'due_date' }
      ]
    }
    if (fieldType === 'deal.pipeline' && crmSchema?.stages) {
      // Filter stages for the selected pipeline
      console.log('🔍 Filtering stages for pipeline:', { level1Value, allStages: crmSchema.stages })
      const stagesForPipeline = crmSchema.stages.filter((stage: any) => {
        const pipelineMatch = stage.pipeline_id?.toString() === level1Value?.toString()
        console.log(`Stage ${stage.name} (pipeline_id: ${stage.pipeline_id}) matches ${level1Value}? ${pipelineMatch}`)
        return pipelineMatch
      })
      console.log('🎯 Filtered stages:', stagesForPipeline)
      return stagesForPipeline.map((stage: any) => ({
        id: stage.id,
        name: stage.name,
        value: stage.id
      }))
    }
    if (fieldType === 'person.contact') {
      if (level1Value === 'emails' || level1Value === 'phones') {
        return [
          { id: 'primary', name: 'Primary', value: 'primary' },
          { id: 'work', name: 'Work', value: 'work' },
          { id: 'home', name: 'Home', value: 'home' },
          { id: 'other', name: 'Other', value: 'other' }
        ]
      }
    }
    return []
  }

  const getDynamicCrmFields = () => {
    if (!crmSchema) return []
    
    const fields: any[] = []
    
    // Add special two-level fields first
    fields.push({
      id: 'activity',
      name: '📝 New Activity (Call, Meeting, etc.)',
      type: 'two-level',
      category: 'Activity',
      isCustom: false,
      description: 'Create new activity records with notes, subjects, and details',
      needsTwoLevel: true
    })

    fields.push({
      id: 'deal.create',
      name: '💼 Create New Deal',
      type: 'action',
      category: 'Deal Actions', 
      isCustom: false,
      description: 'Create a new deal/opportunity when condition is met',
      needsTwoLevel: false
    })

    fields.push({
      id: 'person.create',
      name: '👤 Create New Contact',
      type: 'action',
      category: 'Contact Actions',
      isCustom: false,
      description: 'Create a new contact/person when condition is met',
      needsTwoLevel: false
    })

    fields.push({
      id: 'deal.pipeline',
      name: '🏢 Deal → Pipeline Stage', 
      type: 'two-level',
      category: 'Deal Stages',
      isCustom: false,
      description: 'Move deals through your sales pipeline stages',
      needsTwoLevel: true
    })

    // Add core Person fields
    if (crmSchema.personFields) {
      crmSchema.personFields.forEach((field: any) => {
        fields.push({
          id: `person.${field.key}`,
          name: field.name,
          type: field.field_type,
          category: 'Contact Fields',
          isCustom: field.add_time !== null, // Custom if it has an add_time
          description: `Person field: ${field.name}`,
          options: field.options
        })
      })
    }
    
    // Add core Deal fields
    if (crmSchema.dealFields) {
      crmSchema.dealFields.forEach((field: any) => {
        fields.push({
          id: `deal.${field.key}`,
          name: field.name,
          type: field.field_type,
          category: 'Deal Fields',
          isCustom: field.add_time !== null,
          description: `Deal field: ${field.name}`,
          options: field.options
        })
      })
    }
    
    // NOTE: Individual deal stages removed - use the two-level "Deal Pipeline & Stage" field instead
    
    // Add Deal Labels (custom enum/set fields)
    if (crmSchema.dealLabels) {
      crmSchema.dealLabels.forEach((label: any) => {
        label.options?.forEach((option: any) => {
          fields.push({
            id: `deal.${label.field_key}.${option.id}`,
            name: `${label.field_name}: ${option.label}`,
            type: 'enum',
            category: 'Deal Labels',
            isCustom: true,
            description: `Set ${label.field_name} to ${option.label}`,
            value: option.id,
            color: option.color
          })
        })
      })
    }
    
    // Add Person Labels (custom enum/set fields)
    if (crmSchema.personLabels) {
      crmSchema.personLabels.forEach((label: any) => {
        label.options?.forEach((option: any) => {
          fields.push({
            id: `person.${label.field_key}.${option.id}`,
            name: `${label.field_name}: ${option.label}`,
            type: 'enum',
            category: 'Contact Labels',
            isCustom: true,
            description: `Set ${label.field_name} to ${option.label}`,
            value: option.id,
            color: option.color
          })
        })
      })
    }
    
    // NOTE: Individual activity types removed - use the two-level "Activity" field instead
    
    // Add Users for ownership assignment
    if (crmSchema.users) {
      crmSchema.users.forEach((user: any) => {
        if (user.active_flag) {
          fields.push({
            id: `*.owner_id.${user.id}`,
            name: `Assign to: ${user.name}`,
            type: 'enum',
            category: 'Ownership',
            isCustom: false,
            description: `Assign to user ${user.name}`,
            value: user.id
          })
        }
      })
    }
    
    return fields
  }

  const getFieldDisplayName = (fieldKey: string) => {
    if (!crmSchema) return fieldKey

    // Handle different field types based on the fieldKey pattern
    if (fieldKey.includes('stage')) {
      // Find stage name from schema
      const stageMatch = fieldKey.match(/stage['"]*:?\s*['"]?(\d+)['"]?/)
      if (stageMatch && crmSchema.stages) {
        const stage = crmSchema.stages.find((s: any) => s.id.toString() === stageMatch[1])
        return stage ? `Stage: ${stage.name}` : fieldKey
      }
      return 'Deal Stage'
    }
    
    if (fieldKey.includes('deal.')) {
      const field = fieldKey.replace('deal.', '')
      if (crmSchema.dealFields) {
        const dealField = crmSchema.dealFields.find((f: any) => f.key === field)
        return dealField ? `Deal: ${dealField.name}` : fieldKey
      }
    }
    
    if (fieldKey.includes('person.') || fieldKey.includes('contact.')) {
      const field = fieldKey.replace(/^(person|contact)\./, '')
      if (crmSchema.personFields) {
        const personField = crmSchema.personFields.find((f: any) => f.key === field)
        return personField ? `Contact: ${personField.name}` : fieldKey
      }
    }
    
    if (fieldKey.includes('activity.')) {
      const field = fieldKey.replace('activity.', '')
      return `Activity: ${field.charAt(0).toUpperCase() + field.slice(1)}`
    }
    
    return fieldKey
  }

  // Restore previous state
  const restoreState = () => {
    if (savedState) {
      setConfig(savedState.config)
      if (savedState.currentStep !== undefined) {
        setCurrentStep(savedState.currentStep)
      }
      setRetellApiKey(savedState.retellApiKey || '')
      setIsLoading(savedState.isLoading || false)
      toast.success('Previous wizard state restored!')
    }
  }

  // Goal-based outcome templates that adapt based on the selected call goal
  // Create smart workflow based on call goal
  const createSmartWorkflow = (goal: string, templateId: string) => {
    const baseWorkflow = {
      id: `workflow_${Date.now()}`,
      enabled: true,
      trigger: { event: 'call_analyzed' },
      conditions: [
        {
          field: 'call_analysis.call_successful',
          operator: 'indicates_success',
          value: true,
          logicalOperator: 'AND' as const
        }
      ]
    };

    switch (goal) {
      case 'book_meeting':
        return {
          ...baseWorkflow,
          name: '📅 Meeting Booked Workflow',
          description: 'Automatically creates deal, logs activity, and schedules follow-up when meeting is booked',
          actions: [
            {
              type: 'create_deal',
              crmObject: 'deal',
              fields: {
                'deal.title': '{{retell_llm_dynamic_variables.customer_name}} - Meeting Scheduled',
                'deal.value': '{{retell_llm_dynamic_variables.deal_value}}',
                'deal.person_id': '{{call.metadata.contact_id}}',
                'deal.stage_id': 'meeting_scheduled',
                'deal.pipeline_id': 'sales_pipeline'
              }
            },
            {
              type: 'create_activity',
              crmObject: 'activity',
              fields: {
                'activity.subject': 'Call: Meeting Scheduled with {{retell_llm_dynamic_variables.customer_name}}',
                'activity.note': '{{call.transcript}}',
                'activity.type': 'call',
                'activity.person_id': '{{call.metadata.contact_id}}',
                'activity.deal_id': '{{previous_action.deal_id}}',
                'activity.done': true
              }
            },
            {
              type: 'update_person',
              crmObject: 'person',
              fields: {
                'person.id': '{{call.metadata.contact_id}}',
                'person.notes': 'Meeting scheduled on {{retell_llm_dynamic_variables.meeting_date}}'
              }
            }
          ]
        };

      case 'qualify_lead':
        return {
          ...baseWorkflow,
          name: '🎯 Lead Qualified Workflow',
          description: 'Updates lead scoring and status when qualification is successful',
          actions: [
            {
              type: 'update_person',
              crmObject: 'person',
              fields: {
                'person.id': '{{call.metadata.contact_id}}',
                'person.lead_score': '{{retell_llm_dynamic_variables.lead_score}}',
                'person.notes': '{{call_analysis.call_summary}}'
              }
            },
            {
              type: 'create_activity',
              crmObject: 'activity',
              fields: {
                'activity.subject': 'Qualification Call Completed',
                'activity.note': '{{call.transcript}}',
                'activity.type': 'call',
                'activity.person_id': '{{call.metadata.contact_id}}',
                'activity.done': true
              }
            }
          ]
        };

      default:
        return {
          ...baseWorkflow,
          name: '✅ Call Success Workflow',
          description: 'Basic workflow for successful calls',
          actions: [
            {
              type: 'create_activity',
              crmObject: 'activity',
              fields: {
                'activity.subject': 'Successful Call',
                'activity.note': '{{call.transcript}}',
                'activity.type': 'call',
                'activity.person_id': '{{call.metadata.contact_id}}',
                'activity.done': true
              }
            }
          ]
        };
    }
  };

  const getOutcomeTemplates = (selectedGoal?: string) => [
    {
      id: 'goal-achieved',
      name: selectedGoal === 'book_meeting' ? '✅ Meeting Successfully Booked' : 
            selectedGoal === 'qualify_lead' ? '✅ Lead Successfully Qualified' :
            selectedGoal === 'close_deal' ? '✅ Deal Successfully Closed' :
            selectedGoal === 'collect_info' ? '✅ Information Successfully Collected' :
            selectedGoal === 'follow_up' ? '✅ Follow-up Completed' :
            selectedGoal === 'customer_service' ? '✅ Issue Successfully Resolved' :
            '✅ Call Goal Achieved',
      description: selectedGoal === 'book_meeting' ? 'Meeting/appointment was scheduled - create deal and calendar event' :
                  selectedGoal === 'qualify_lead' ? 'Lead qualification completed - update lead scoring and next steps' :
                  selectedGoal === 'close_deal' ? 'Sale was completed - create won deal and celebration task' :
                  selectedGoal === 'collect_info' ? 'Information was gathered - update contact with new data' :
                  selectedGoal === 'follow_up' ? 'Follow-up completed - update contact and plan next touch' :
                  selectedGoal === 'customer_service' ? 'Support issue resolved - close ticket and log resolution' :
                  'When your call achieves its primary goal',
      triggerCondition: 'AI detected the call goal was achieved',
      actions: selectedGoal === 'book_meeting' ? [
        '📅 Create calendar appointment/meeting',
        '💼 Create deal/opportunity for the meeting',
        '📝 Log call activity with meeting details',
        '📞 Update contact status to "Meeting Scheduled"',
        '🔔 Set reminder before the meeting'
      ] : selectedGoal === 'qualify_lead' ? [
        '🎯 Update lead qualification score',
        '📝 Log qualification call activity',
        '📊 Update lead status/stage',
        '📞 Update contact with qualification notes',
        '⏭️ Trigger next step in sales process'
      ] : [
        '📝 Log call activity with full details',
        '📞 Update contact information',
        '💼 Create/update deal based on outcome',
        '📅 Schedule appropriate follow-up',
        '🏷️ Update tags and status'
      ],
      enabled: true
    },
    {
      id: 'goal-not-achieved',
      name: selectedGoal === 'book_meeting' ? '❌ Meeting Not Booked' : 
            selectedGoal === 'qualify_lead' ? '❌ Lead Not Qualified' :
            selectedGoal === 'close_deal' ? '❌ Deal Not Closed' :
            '❌ Call Goal Not Achieved',
      description: selectedGoal === 'book_meeting' ? 'No meeting was scheduled - log call and set follow-up' :
                  selectedGoal === 'qualify_lead' ? 'Lead qualification incomplete - plan next steps' :
                  'Call completed but goal was not achieved',
      triggerCondition: 'Call completed but goal not reached',
      actions: [
        '📝 Log call activity with notes',
        '📞 Update contact with call outcome',
        '🔄 Schedule follow-up action',
        '🏷️ Add appropriate tags/status'
      ],
      enabled: true
    },
    {
      id: 'no-answer-voicemail',
      name: '📞 Missed Call / Voicemail', 
      description: 'When In Voicemail = True → Create missed call activity',
      triggerCondition: 'In Voicemail = True detected',
      actions: [
        '📝 Log "Missed Call" activity in CRM',
        '📞 Mark contact as "Attempted Contact"', 
        '⏰ Schedule automatic follow-up call',
        '📧 Trigger voicemail follow-up sequence'
      ],
      enabled: true,
      // Actual workflow logic for when this template is converted
      trigger: { event: 'call_analyzed' },
      conditions: [
        {
          field: 'call_analysis.in_voicemail',
          operator: 'equals',
          value: true,
          logicalOperator: 'AND'
        }
      ],
      workflowActions: [
        {
          type: 'create_activity',
          crmObject: 'activity',
          fields: {
            'activity.subject': 'Missed Call - Voicemail',
            'activity.note': 'Call went to voicemail. Follow-up needed.',
            'activity.type': 'call',
            'activity.person_id': '{{call.metadata.contact_id}}',
            'activity.done': true
          }
        },
        {
          type: 'update_person',
          crmObject: 'person', 
          fields: {
            'person.id': '{{call.metadata.contact_id}}',
            'person.custom_field.last_contact_attempt': '{{call.start_timestamp}}',
            'person.custom_field.contact_status': 'Voicemail - Follow up needed'
          }
        }
      ]
    },
    {
      id: 'custom-outcome',
      name: '⚙️ Custom Business Logic',
      description: 'Build your own conditions and actions',
      triggerCondition: 'Configure your own triggers...',
      actions: [
        '🔧 Define custom conditions',
        '⚡ Set multiple actions',
        '🎯 Map to your specific fields'
      ],
      enabled: false
    }
  ]

  const addWorkflowTemplate = (template: any) => {
    // Create base workflow with proper structure
    const newWorkflow: BusinessWorkflow = {
      id: `workflow_${Date.now()}_${template.id}`,
      name: template.name,
      description: template.description,
      enabled: template.enabled || true,
      trigger: template.trigger || { event: 'call_analyzed' },
      conditions: template.conditions || [],
      actions: template.workflowActions || template.actions || []
    }
    
    console.log(`🔧 addWorkflowTemplate creating workflow:`, newWorkflow.name, 'with', newWorkflow.actions.length, 'actions')
    setConfig(prev => ({
      ...prev,
      businessWorkflows: [...prev.businessWorkflows, newWorkflow]
    }))
  }

  // Fetch available agents when account is connected
  const fetchAvailableAgents = async (apiKey: string) => {
    if (!apiKey) {
      toast.error('Please enter your Retell API key first')
      return
    }

    console.log('🔑 Fetching agents directly from Retell API...')
    try {
      // Call Retell API using the official documented endpoint (like it was working before)
      console.log('🌐 Calling official Retell API endpoint...')
      const response = await fetch('https://api.retellai.com/list-agents', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      console.log('📡 Retell API response status:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Retell API error response:', errorText)
        throw new Error(`Retell API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      console.log('📦 Retell API response data:', data)
      console.log('📦 Type of data:', typeof data, 'Is array:', Array.isArray(data))
      
      const agents = data.data || data.agents || data || []
      console.log('👥 Found agents:', agents.length, agents)
      console.log('👥 Type of agents:', typeof agents, 'Is array:', Array.isArray(agents))
      
      // Transform the real Retell data to match our interface
      // Remove duplicates based on agent_id
      const uniqueAgents = agents.filter((agent: any, index: number, self: any[]) => 
        index === self.findIndex(a => a.agent_id === agent.agent_id)
      )
      
      // First, create basic agent objects with predefined custom fields
      let transformedAgents: RetellAgent[] = uniqueAgents.map((agent: any) => {
        // Extract custom fields from post_call_analysis_data (predefined fields)
        const predefinedFields = Array.isArray(agent.post_call_analysis_data) ? agent.post_call_analysis_data : []
        const customFieldsArray = predefinedFields
          .filter(field => field && field.name) // Filter out null/undefined fields
          .map((field: any) => field.name) // Show clean field names
        console.log(`🏷️ Agent ${agent.agent_name} custom fields:`, customFieldsArray)
        
        return {
          agent_id: agent.agent_id,
          name: agent.agent_name || `Agent ${agent.agent_id}`,
          description: agent.voice_model || 'Retell AI Agent',
          created_at: agent.created_at,
          last_call: 'Loading...',
          call_count: 0,
          active: true,
          customFieldsCount: customFieldsArray.length,
          customFields: customFieldsArray,
          // Add empty purpose data for now, will be populated later
          purposes: {
            inbound: false,
            outbound: false,
            phoneNumbers: []
          },
          canHandleInbound: false,
          canHandleOutbound: false,
          canHandleBoth: false,
          primaryPurpose: 'none' as 'inbound' | 'outbound' | 'both' | 'none'
        }
      })

      // Don't set agents immediately - wait for enhancement with phone numbers

      // Fetch phone numbers to determine agent purposes
      console.log('🚀 STARTING PHONE NUMBER DETECTION - This should appear in console!')
      console.log('📱 Fetching phone numbers for purpose detection...')
      
      // Just use original agents directly - no complex phone number grouping needed
      
      try {
        const phoneResponse = await fetch('https://api.retellai.com/list-phone-numbers', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        })
        
        console.log('📱 Phone API response status:', phoneResponse.status)

        if (phoneResponse.ok) {
          const phoneNumbers = await phoneResponse.json() // Response is directly an array
          console.log('📱 Phone numbers fetched for enhancement:', phoneNumbers.length, 'numbers')
          // Phone numbers will be used to enhance agent descriptions later
        }
      } catch (error) {
        console.warn('⚠️ Could not fetch phone numbers for purpose detection:', error)
      }

      // Now fetch REAL data for each unique agent (skip complex phone grouping)
      // But first enhance agent descriptions with their phone number assignments
      let agentPhoneMap = new Map()
      let phoneEnhancementSuccessful = false
      
      try {
        const phoneResponse = await fetch('https://api.retellai.com/list-phone-numbers', {
          method: 'GET', 
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        })
        
        if (phoneResponse.ok) {
          const phoneNumbers = await phoneResponse.json()
          console.log('📱 Enhancing agents with phone number info:', phoneNumbers)
          
          phoneEnhancementSuccessful = true
          
          phoneNumbers.forEach((phone: any) => {
            // Track inbound assignments
            if (phone.inbound_agent_id) {
              if (!agentPhoneMap.has(phone.inbound_agent_id)) {
                agentPhoneMap.set(phone.inbound_agent_id, [])
              }
              agentPhoneMap.get(phone.inbound_agent_id).push({
                number: phone.phone_number || phone.phone_number_pretty,
                type: phone.inbound_agent_id === phone.outbound_agent_id ? 'both' : 'inbound'
              })
            }
            
            // Track outbound assignments (only if different from inbound)
            if (phone.outbound_agent_id && phone.outbound_agent_id !== phone.inbound_agent_id) {
              if (!agentPhoneMap.has(phone.outbound_agent_id)) {
                agentPhoneMap.set(phone.outbound_agent_id, [])
              }
              agentPhoneMap.get(phone.outbound_agent_id).push({
                number: phone.phone_number || phone.phone_number_pretty,
                type: 'outbound'
              })
            }
          })
        }
      } catch (error) {
        console.warn('⚠️ Could not enhance agents with phone info:', error)
      }
      
      // Create enhanced agents with phone number information
      const currentAgents = transformedAgents.map(agent => {
        const phoneAssignments = agentPhoneMap.get(agent.agent_id) || []
        const phoneCount = phoneAssignments.length
        
        let enhancedDescription = agent.description || ''
        if (phoneCount > 0) {
          const phoneList = phoneAssignments.map(p => `${p.number} (${p.type})`).join(', ')
          enhancedDescription = `Handles ${phoneCount} phone number${phoneCount > 1 ? 's' : ''}: ${phoneList}`
        }
        
        return {
          ...agent,
          id: agent.agent_id, // Ensure unique React key
          description: enhancedDescription,
          phoneAssignments
        }
      })
      console.log(`🚀 Starting to fetch real data for ${currentAgents.length} individual agents`)
      
      for (let i = 0; i < currentAgents.length; i++) {
        const agent = currentAgents[i]
        try {
          console.log(`📞 [${i+1}/${currentAgents.length}] Fetching REAL calls for agent: ${agent.name}`)
          console.log(`🔍 Agent details:`, {
            agentId: agent.agent_id,
            integrationType: agent.integrationType,
            description: agent.description
          })
          
          console.log(`📋 Fetching calls for agent: ${agent.agent_id}`)
          
          const callsResponse = await fetch('https://api.retellai.com/v2/list-calls', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              agent_id: agent.agent_id,
              limit: 50
            })
          })

          console.log(`📡 Response status for agent ${agent.agent_id}:`, callsResponse.status)
          
          if (callsResponse.ok) {
            const callsData = await callsResponse.json()
            console.log(`📦 Raw response for agent ${agent.agent_id}:`, callsData)
            
            // Handle different response structures
            let calls = [];
            if (Array.isArray(callsData)) {
              calls = callsData;
            } else if (callsData.data && Array.isArray(callsData.data)) {
              calls = callsData.data;
            } else if (callsData.calls && Array.isArray(callsData.calls)) {
              calls = callsData.calls;
            } else {
              // Response might be an object with numeric keys (like "0", "1", "2")
              calls = Object.values(callsData).filter(item => typeof item === 'object' && item.call_id);
            }
            
            // Filter calls by agent_id in case API didn't filter properly
            const agentCalls = calls.filter((call: any) => call.agent_id === agent.agent_id);
            console.log(`📞 Found ${agentCalls.length} calls for agent ${agent.agent_id}`)
          
          if (agentCalls.length > 0) {
            console.log(`🔍 Sample call structure for agent:`, agentCalls[0])
            
            // Extract REAL custom fields from actual call data with categories
            const fieldsByCategory = {
              variables: new Set<string>(),
              metadata: new Set<string>(),
              analysis: new Set<string>()
            }
            
            agentCalls.forEach((call: any, callIndex: number) => {
              console.log(`🔍 Analyzing call ${callIndex + 1} for ${agent.name}:`, call.call_id)
              
              // Extract retell_llm_dynamic_variables (name, procedure, phone, email)
              if (call.retell_llm_dynamic_variables && typeof call.retell_llm_dynamic_variables === 'object') {
                console.log(`📋 Dynamic variables found:`, call.retell_llm_dynamic_variables)
                Object.keys(call.retell_llm_dynamic_variables).forEach(key => {
                  fieldsByCategory.variables.add(key)
                  console.log(`✅ Added dynamic var: ${key}`)
                })
              }
              
              // Extract metadata (inboundlead_id, lead_id, source)  
              if (call.metadata && typeof call.metadata === 'object') {
                console.log(`🏷️ Metadata found:`, call.metadata)
                Object.keys(call.metadata).forEach(key => {
                  fieldsByCategory.metadata.add(key)
                  console.log(`✅ Added metadata: ${key}`)
                })
              }
              
              // Extract call_analysis.custom_analysis_data (the key fields!)
              if (call.call_analysis?.custom_analysis_data && typeof call.call_analysis.custom_analysis_data === 'object') {
                console.log(`🎯 Custom analysis data found:`, call.call_analysis.custom_analysis_data)
                Object.keys(call.call_analysis.custom_analysis_data).forEach(key => {
                  fieldsByCategory.analysis.add(key)
                  console.log(`✅ Added analysis: ${key}`)
                })
              }
            })
            
            // Remove system fields from all categories
            const systemFieldsToRemove = ['current_time_Europe/London', 'agent_version', 'access_token']
            systemFieldsToRemove.forEach(field => {
              fieldsByCategory.variables.delete(field)
              fieldsByCategory.metadata.delete(field)
              fieldsByCategory.analysis.delete(field)
            })

            const totalFields = fieldsByCategory.variables.size + fieldsByCategory.metadata.size + fieldsByCategory.analysis.size
            const customFieldsArray = [
              ...Array.from(fieldsByCategory.variables),
              ...Array.from(fieldsByCategory.metadata), 
              ...Array.from(fieldsByCategory.analysis)
            ]
            const lastCall = agentCalls.length > 0 ? new Date(agentCalls[0].end_timestamp).toLocaleString() : 'No calls'

            console.log(`🎯 Final custom fields for ${agent.name}:`, customFieldsArray)

            // Update this specific agent with REAL call data AND real custom fields
            // Preserve the enhanced description while updating call data
            currentAgents[i] = {
              ...currentAgents[i], // Use current enhanced agent with phone descriptions
              call_count: agentCalls.length,
              last_call: lastCall,
              customFieldsCount: totalFields,
              customFields: customFieldsArray,
              fieldsByCategory: fieldsByCategory
            }

            // Don't update config here - will do final update at end to avoid race conditions
            // setConfig removed to prevent race conditions

            console.log(`✅ Updated agent ${agent.name}: ${agentCalls.length} calls, ${customFieldsArray.length} custom fields`)
          } else {
            console.log(`⚠️ No calls found for agent: ${agent.name}`)
          }
          } else {
            const errorText = await callsResponse.text()
            console.error(`❌ API error for agent ${agent.agent_id}: ${callsResponse.status} - ${errorText}`)
          }
        } catch (error) {
          console.error(`❌ Network error for agent ${agent.name}:`, error)
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      // Use currentAgents if phone enhancement worked, otherwise use transformedAgents
      const finalAgents = phoneEnhancementSuccessful ? currentAgents : transformedAgents
      console.log('✅ Final enhanced agents with real data:', finalAgents)
      
      // Update config with the final enhanced agents
      setConfig(prev => ({ ...prev, availableAgents: finalAgents }))
      console.log('💾 Final enhanced agents updated to config')
      setIsLoading(false) // End loading after successful enhancement
      toast.success(`Found ${finalAgents.length} agents in your Retell account`)
    } catch (error: any) {
      console.error('❌ Full error details:', error)
      
      if (error.message.includes('fetch')) {
        toast.error('Network error: Cannot reach Retell API. This might be a CORS issue.')
      } else if (error.message.includes('401')) {
        toast.error('Invalid API key. Please check your Retell API key.')
      } else if (error.message.includes('403')) {
        toast.error('Access denied. Please check your API key permissions.')
      } else {
        toast.error(`API Error: ${error.message}`)
      }
      throw error // Re-throw so the connect button can handle it
    }
  }

  // Function to analyze webhook payload and discover custom fields
  const analyzeWebhookPayload = (payload: any): RetellField[] => {
    const discoveredFields: RetellField[] = [...STANDARD_RETELL_FIELDS]
    
    if (!payload?.call) return discoveredFields

    const call = payload.call

    // Discover retell_llm_dynamic_variables
    if (call.retell_llm_dynamic_variables) {
      Object.entries(call.retell_llm_dynamic_variables).forEach(([key, value]) => {
        discoveredFields.push({
          id: `retell_llm_dynamic_variables.${key}`,
          name: `Dynamic Variable: ${key.charAt(0).toUpperCase() + key.slice(1)}`,
          type: typeof value === 'string' ? 'string' : typeof value,
          description: `Custom dynamic variable: ${key}`,
          category: 'Dynamic Variables',
          isCustom: true,
          sampleValue: value
        })
      })
    }

    // Discover metadata fields (often contains CRM linking IDs)
    if (call.metadata) {
      Object.entries(call.metadata).forEach(([key, value]) => {
        // Highlight fields that might be used for CRM linking
        const isLinkingField = key.includes('id') || key.includes('_id') || 
                              key.includes('lead') || key.includes('contact') ||
                              key.includes('person') || key.includes('deal')
        
        discoveredFields.push({
          id: `metadata.${key}`,
          name: `Metadata: ${key.charAt(0).toUpperCase() + key.slice(1)}${isLinkingField ? ' 🔗' : ''}`,
          type: typeof value === 'string' ? 'string' : typeof value,
          description: `Custom metadata field: ${key}${isLinkingField ? ' (potential linking field)' : ''}`,
          category: isLinkingField ? 'Linking' : 'Metadata',
          isCustom: true,
          sampleValue: value
        })
      })
    }

    // Discover custom_analysis_data (the key part!)
    if (call.call_analysis?.custom_analysis_data) {
      Object.entries(call.call_analysis.custom_analysis_data).forEach(([key, value]) => {
        const fieldName = key.startsWith('_') ? key.substring(1) : key
        discoveredFields.push({
          id: `call_analysis.custom_analysis_data.${key}`,
          name: `Custom Analysis: ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1).replace(/_/g, ' ')}`,
          type: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string',
          description: `Agent-specific analysis field: ${fieldName}`,
          category: 'Custom Analysis',
          isCustom: true,
          sampleValue: value
        })
      })
    }

    return discoveredFields
  }

  // Real implementation - fetch recent calls for connected agent from Retell API
  const discoverFieldsFromAgent = async (agentId: string) => {
    // Try to get API key from OAuth token or manual entry
    let apiKey = retellApiKey
    if (!apiKey && config.retellAccountId) {
      // Try to get access token from connected account
      try {
        const accountResponse = await api.get(`/accounts/${config.retellAccountId}`)
        if (accountResponse.data.success && accountResponse.data.data.accessToken) {
          apiKey = accountResponse.data.data.accessToken
          console.log('✅ Using OAuth access token for Retell API')
        }
      } catch (error) {
        console.warn('Could not get OAuth token, falling back to manual API key')
      }
    }
    
    if (!apiKey) {
      toast.error('Please enter your Retell API key first or ensure your Retell account is properly connected')
      return
    }

    console.log('🔍 Discovering fields for agent:', agentId)
    setIsLoading(true)

    try {
      // Call REAL Retell API to get recent calls for this agent using correct POST endpoint
      console.log('📞 Fetching recent calls from Retell API...')
      const response = await fetch('https://api.retellai.com/v2/list-calls', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: agentId,
          limit: 1 // Only get the most recent call with latest agent config
        })
      })

      console.log('📡 List calls API response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ List calls API error:', errorText)
        throw new Error(`Retell API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      console.log('📦 List calls response data:', data)
      
      // Handle different API response formats
      let recentCalls = []
      if (Array.isArray(data)) {
        recentCalls = data
      } else if (data.data && Array.isArray(data.data)) {
        recentCalls = data.data
      } else if (data.calls && Array.isArray(data.calls)) {
        recentCalls = data.calls
      } else {
        console.warn('⚠️ Unexpected API response format:', data)
      }
      
      console.log('🔍 Parsed calls array:', recentCalls)
      console.log('🔍 First call sample:', recentCalls[0])
      
      if (recentCalls.length === 0) {
        toast.error('No recent calls found for this agent. Try the manual method.')
        discoverFieldsFromSample()
        return
      }

      // Analyze the real call data to discover fields
      // Analyze the real call data to discover custom fields
      const allDiscoveredFields = [...STANDARD_RETELL_FIELDS]
      const discoveredCustomFields = new Set<string>()
      
      recentCalls.forEach((call: any) => {
        console.log('🔍 Analyzing call:', call.call_id)
        
        // Discover retell_llm_dynamic_variables
        if (call.retell_llm_dynamic_variables) {
          Object.keys(call.retell_llm_dynamic_variables).forEach(key => {
            discoveredCustomFields.add(`retell_llm_dynamic_variables.${key}`)
          })
        }

        // Discover metadata fields
        if (call.metadata) {
          Object.keys(call.metadata).forEach(key => {
            discoveredCustomFields.add(`metadata.${key}`)
          })
        }

        // Discover custom_analysis_data
        if (call.call_analysis?.custom_analysis_data) {
          Object.keys(call.call_analysis.custom_analysis_data).forEach(key => {
            discoveredCustomFields.add(`custom_analysis_data.${key}`)
          })
        }
        
        // Analyze each call's webhook data to discover additional fields
        const webhookData = {
          call: call,
          event: 'call_ended',
          data: call
        }
        const fieldsFromCall = analyzeWebhookPayload(webhookData)
        fieldsFromCall.forEach(field => {
          if (field.isCustom && !allDiscoveredFields.find(f => f.id === field.id)) {
            allDiscoveredFields.push(field)
          }
        })
      })

      // No expansion needed - use dropdowns for boolean values instead
      
      // Update the selected agent with actual custom field count
      const customFieldsArray = Array.from(discoveredCustomFields)
      setConfig(prev => ({ 
        ...prev, 
        retellFields: allDiscoveredFields,
        discoveredFields: allDiscoveredFields,
        lastWebhookSample: { call: recentCalls[0] },
        availableAgents: prev.availableAgents?.map(agent => 
          agent.agent_id === agentId 
            ? { ...agent, customFieldsCount: customFieldsArray.length, customFields: customFieldsArray }
            : agent
        ) || []
      }))

      console.log('✅ Discovered custom fields:', customFieldsArray)
      toast.success(`🎯 Analyzed ${recentCalls.length} recent calls, found ${customFieldsArray.length} custom fields!`)
    } catch (error: any) {
      console.error('❌ Error discovering fields:', error)
      if (error.message.includes('401')) {
        toast.error('Invalid API key for fetching calls')
      } else if (error.message.includes('403')) {
        toast.error('API key does not have permission to list calls')
      } else {
        toast.error(`Failed to analyze recent calls: ${error.message}`)
      }
      discoverFieldsFromSample()
    } finally {
      setIsLoading(false)
    }
  }

  // Manual webhook paste method (for demo/testing)
  const discoverFieldsFromSample = async () => {
    try {
      // Using your real Retell webhook sample
      const samplePayload = {
        event: "call_analyzed",
        call: {
          call_id: "call_c790d46340a58d1581f124343a6",
          call_type: "phone_call",
          agent_id: "agent_796169b8bb312daa99022798bb",
          agent_name: "Pipedrive: Cosmetic Clinic",
          retell_llm_dynamic_variables: {
            name: "Chris Thompson",
            procedure: "Face Lift",
            phone: "+447366842442",
            email: "nopnors@gmail.com"
          },
          call_status: "ended",
          start_timestamp: 1755689355883,
          end_timestamp: 1755689539248,
          duration_ms: 183365,
          transcript: "Agent: Hello??\nUser: Hi. This\nAgent: Hi Chris, this is Amy calling from Bristol Cosmetics...",
          from_number: "+441174630855",
          to_number: "+447366842442",
          direction: "outbound",
          call_analysis: {
            call_summary: "The user, Chris, inquired about a Face Lift and expressed interest in booking a consultation. After discussing health concerns, the agent successfully booked a consultation for Chris on Friday, August 22nd at 4 PM.",
            in_voicemail: false,
            user_sentiment: "Positive",
            call_successful: true,
            custom_analysis_data: {
              "_procedure": "Facelift",
              "stage_of_consideration": "Consultation Booked",
              "_infopack": "Not Viewed",
              "consultation_booking_status": "Booked",
              "consultation_date": "22/08/25 4:00 PM",
              "_health_concerns_summary": "The user suffers from anxiety and has had an ACL operation a couple of months ago.",
              "lead_readiness_notes": "Chris is ready to move forward with booking a consultation, indicating a clear interest in the procedure.",
              "_objections_questions raised": "Chris expressed confusion about the availability of the 3 PM slot but did not raise any significant objections.",
              "additional_comments": "The agent confirmed the user's contact details before finalizing the booking."
            }
          },
          metadata: {
            inboundlead_id: "2ce36370-7c21-11f0-a5b9-db7c141bb3a9",
            lead_id: "21",
            source: "Web forms"
          },
          recording_url: "https://dxc03zgurdly9.cloudfront.net/384ba42365894c648d49dd5bc2e2d5b315d2fc0a22155128129f0d1b3eafb118/recording.wav",
          call_cost: {
            combined_cost: 28.8266667,
            total_duration_seconds: 184
          }
        }
      }
      
      const discoveredFields = analyzeWebhookPayload(samplePayload)
      
      setConfig(prev => ({ 
        ...prev, 
        discoveredFields, 
        lastWebhookSample: samplePayload 
      }))
      
      const customFieldCount = discoveredFields.filter(f => f.isCustom).length
      toast.success(`🎯 Discovered ${customFieldCount} custom fields from your Retell agent!`)
    } catch (error) {
      toast.error('Failed to analyze webhook payload')
    }
  }

  const { register, handleSubmit, formState: { errors }, watch } = useForm()
  
  const nextStep = () => {
    const newStep = Math.min(currentStep + 1, STEPS.length - 1)
    
    // Auto-generate workflow-based mappings when moving to Field Mapping step (step 3)
    if (newStep === 3 && crmSchema) {
      console.log('🔄 Forcing complete re-render for Field Mapping step')
      
      const activeWorkflows = config.businessWorkflows.filter(w => w.enabled)
      const hasGoalOrWorkflows = config.selectedGoal || activeWorkflows.length > 0
      
      console.log('📊 Step navigation check:', {
        newStep,
        selectedGoal: config.selectedGoal,
        activeWorkflowCount: activeWorkflows.length,
        activeWorkflowNames: activeWorkflows.map(w => w.name),
        hasGoalOrWorkflows,
        willTriggerMapping: hasGoalOrWorkflows
      })
      
      if (hasGoalOrWorkflows) {
        console.log('🤖 Auto-generating workflow-based field mappings...')
        // Generate mappings based on selected goal and workflows
        setTimeout(() => {
          generateAutoMappings(crmSchema, true) // Force generate new mappings
        }, 100) // Small delay to ensure state is updated
      } else {
        console.log('🚫 No goal or workflows selected - skipping auto-mapping')
      }
      
      setRenderKey(prev => prev + 1)
    }
    
    // Preserve fields when moving forward
    setCurrentStep(newStep)
  }
  
  const prevStep = () => {
    // Preserve fields when moving backward
    setCurrentStep(Math.max(currentStep - 1, 0))
  }

  const startOver = () => {
    // Clear all saved data and start fresh
    localStorage.removeItem('integrationWizardState')
    localStorage.removeItem('integration_wizard_state') // Clear both possible keys
    localStorage.removeItem('wizard_currently_initializing')
    console.log('🧹 Cleared all localStorage state - reloading page')
    
    // Clear all session storage as well
    sessionStorage.clear()
    
    // Show toast briefly then reload page
    toast.success('Cleared state - reloading page!', { duration: 1000 })
    
    // Reload the page after a brief delay to show the toast
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  }

  const addFieldMapping = () => {
    setConfig(prev => ({
      ...prev,
      fieldMappings: [...prev.fieldMappings, { sourceField: '', targetField: '', required: false }]
    }))
  }

  const removeFieldMapping = (index: number) => {
    setConfig(prev => ({
      ...prev,
      fieldMappings: prev.fieldMappings.filter((_, i) => i !== index)
    }))
  }

  const updateFieldMapping = (index: number, field: keyof FieldMapping, value: any) => {
    setConfig(prev => ({
      ...prev,
      fieldMappings: prev.fieldMappings.map((mapping, i) => 
        i === index ? { ...mapping, [field]: value } : mapping
      )
    }))
  }

  const handleSave = async () => {
    console.log('🚀 handleSave called - starting integration creation process')
    try {
      setIsLoading(true)
      
      // First, ensure Retell account exists in database if we're using an API key
      let actualRetellAccountId = config.retellAccountId
      if (config.retellAccountId.startsWith('key_')) {
        console.log('🔧 Retell account ID is an API key, creating account record...')
        try {
          const accountData = {
            provider: 'retell',
            providerType: 'voice_ai',
            accountName: 'Retell AI Account',
            apiKey: config.retellAccountId
          }
          const accountResponse = await api.post('/accounts/simple', accountData)
          if (accountResponse.data.success) {
            actualRetellAccountId = accountResponse.data.data.id
            console.log('✅ Created Retell account:', actualRetellAccountId)
            setConfig(prev => ({ ...prev, retellAccountId: actualRetellAccountId }))
          }
        } catch (accountError) {
          console.error('❌ Failed to create Retell account:', accountError)
          throw new Error('Failed to create Retell account. Please try connecting your Retell account again.')
        }
      }

      // Get the selected agent's name
      const selectedAgent = config.availableAgents?.find(agent => agent.agent_id === config.selectedAgentId)
      const agentName = selectedAgent?.name || `Agent ${config.selectedAgentId?.slice(-8) || 'Unknown'}`
      
      // Ensure we have a valid CRM account ID - check URL params if config is empty
      let crmAccountId = config.crmAccountId
      if (!crmAccountId) {
        const urlParams = new URLSearchParams(window.location.search)
        crmAccountId = urlParams.get('accountId') || ''
        console.log('📋 CRM Account ID was empty, using URL param:', crmAccountId)
      }
      
      if (!crmAccountId) {
        console.error('❌ Missing CRM account ID - cannot create integration')
        toast.error('Missing CRM account connection. Please reconnect to your CRM.')
        return
      }
      
      // Prepare integration data
      const integrationData = {
        name: config.name,
        description: config.description,
        retellAccountId: actualRetellAccountId,
        crmAccountId: crmAccountId,
        retellAgentId: config.selectedAgentId,
        retellAgentName: agentName,
        crmObject: 'contacts', // Default to contacts for now
        fieldMappings: config.fieldMappings.map(mapping => ({
          crmField: mapping.targetField,
          retellField: mapping.sourceField,
          transform: mapping.transform || 'none',
          required: mapping.required || false
        })),
        callConfiguration: {
          agentId: config.selectedAgentId,
          selectedPipelineId: config.selectedPipelineId,
          selectedStageId: config.selectedStageId
        }
      }

      console.log('💾 Saving integration:', integrationData)
      
      // Log auth token status for debugging
      const authData = localStorage.getItem('auth-storage')
      let token = null
      if (authData) {
        try {
          const parsed = JSON.parse(authData)
          token = parsed.state?.accessToken
        } catch (error) {
          console.warn('Failed to parse auth storage:', error)
        }
      }
      
      console.log('🔐 Token exists:', !!token)
      console.log('🔐 Token length:', token?.length)
      console.log('🔐 Token starts with:', token?.substring(0, 20) + '...')
      
      // Check for missing token and redirect
      if (!token) {
        console.error('🚨 No authentication token found - redirecting to login')
        toast.error('Please log in to create integrations')
        window.location.href = '/login'
        return
      }

      // Check if we're completing a draft integration
      const response = config.draftId 
        ? await api.post(`/integrations/${config.draftId}/publish`) // Publish the existing draft
        : await api.post('/integrations', integrationData) // Create new integration
      
      if (response.data.success) {
        const createdIntegration = response.data.data // Backend returns integration in data.data
        
        // Update config with the real webhook URL from the created integration
        if (createdIntegration && createdIntegration.webhookUrl) {
          console.log('✅ Got real webhook URL:', createdIntegration.webhookUrl)
          setConfig(prev => ({ ...prev, webhookUrl: createdIntegration.webhookUrl }))
        } else {
          console.error('❌ No webhook URL in response:', response.data)
        }
        
        toast.success('🎉 Integration created successfully! Copy your webhook URL below.')
        
        // Update the config to show the integration was saved
        setConfig(prev => ({ ...prev, integrationSaved: true }))
        
        // Don't navigate away yet - let user copy webhook URL first
        // navigate('/integrations') // Will add a "Continue" button instead
      } else {
        throw new Error(response.data.error || 'Failed to create integration')
      }
    } catch (error: any) {
      console.error('❌ Failed to save integration:', error)
      
      // Handle different types of errors
      if (error.response?.status === 401) {
        console.error('🚨 Authentication failed - token may be expired')
        toast.error('Authentication failed. Please log in again.')
        // Clear invalid tokens and redirect
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.href = '/login'
      } else if (error.response?.status === 400) {
        console.error('🚨 Validation error:', error.response?.data)
        toast.error(error.response?.data?.error || 'Validation failed. Please check your data.')
      } else {
        console.error('🚨 Unexpected error:', error.response || error.message)
        toast.error(error.response?.data?.error || error.message || 'Failed to save integration')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveAsDraft = async () => {
    console.log('💾 handleSaveAsDraft called - saving integration as draft')
    try {
      setIsLoading(true)
      
      // First, ensure Retell account exists in database if we're using an API key
      let actualRetellAccountId = config.retellAccountId
      if (config.retellAccountId.startsWith('key_')) {
        console.log('🔧 Retell account ID is an API key, creating account record...')
        try {
          const accountData = {
            provider: 'retell',
            providerType: 'voice_ai',
            accountName: 'Retell AI Account',
            apiKey: config.retellAccountId
          }
          const accountResponse = await api.post('/accounts/simple', accountData)
          if (accountResponse.data.success) {
            actualRetellAccountId = accountResponse.data.data.id
            console.log('✅ Created Retell account:', actualRetellAccountId)
            setConfig(prev => ({ ...prev, retellAccountId: actualRetellAccountId }))
          }
        } catch (accountError) {
          console.error('❌ Failed to create Retell account:', accountError)
          throw new Error('Failed to create Retell account. Please try connecting your Retell account again.')
        }
      }

      // Get the selected agent's name
      const selectedAgent = config.availableAgents?.find(agent => agent.agent_id === config.selectedAgentId)
      const agentName = selectedAgent?.name || `Agent ${config.selectedAgentId?.slice(-8) || 'Unknown'}`

      // Ensure we have a valid CRM account ID - check URL params if config is empty
      let crmAccountId = config.crmAccountId
      if (!crmAccountId) {
        const urlParams = new URLSearchParams(window.location.search)
        crmAccountId = urlParams.get('accountId') || ''
        console.log('📋 CRM Account ID was empty, using URL param:', crmAccountId)
      }
      
      if (!crmAccountId) {
        console.error('❌ Missing CRM account ID:', {
          'config.crmAccountId': config.crmAccountId,
          'urlParams': Object.fromEntries(new URLSearchParams(window.location.search).entries()),
          'config': config
        })
        throw new Error('Missing CRM account connection. Please reconnect to your CRM.')
      }

      console.log('📝 Preparing draft integration data...')
      const integrationData = {
        name: config.name,
        description: config.description,
        retellAccountId: actualRetellAccountId,
        crmAccountId: crmAccountId,
        retellAgentId: config.selectedAgentId,
        retellAgentName: agentName,
        crmObject: 'contacts',
        fieldMappings: config.fieldMappings.map((mapping, index) => {
          console.log(`🔍 Draft field mapping ${index}:`, mapping)
          return {
            crmField: mapping.targetField || mapping.crmField || 'unknown',
            retellField: mapping.sourceField || mapping.retellField || 'unknown',
            transform: mapping.transform || 'none',
            required: mapping.required || false
          }
        }),
        callConfiguration: {
          agentId: config.selectedAgentId,
          selectedPipelineId: config.selectedPipelineId,
          selectedStageId: config.selectedStageId
        },
        businessWorkflows: config.businessWorkflows, // Save workflows
        isDraft: true, // Mark as draft
        currentStep: currentStep // Save the current step user is on
      }

      // Check if we're updating an existing draft or creating a new one
      const existingDraftId = config.draftId || (window.location.pathname.includes('/continue') && id)
      
      let response
      if (existingDraftId) {
        console.log('🔄 Updating existing draft integration:', existingDraftId)
        console.log('📤 Request data:', JSON.stringify(integrationData, null, 2))
        response = await api.put(`/integrations/${existingDraftId}`, integrationData)
      } else {
        console.log('🚀 Creating new draft integration...')
        console.log('📤 Request data:', JSON.stringify(integrationData, null, 2))
        response = await api.post('/integrations', integrationData)
      }
      
      if (response.data.success) {
        const draftIntegration = response.data.data
        const actionText = existingDraftId ? 'updated' : 'created'
        console.log(`✅ Draft integration ${actionText}:`, draftIntegration.id)
        
        // Update config with draft ID (in case it was newly created)
        setConfig(prev => ({ 
          ...prev, 
          draftId: draftIntegration.id,
          integrationSaved: false // Keep as unsaved for UI purposes
        }))
        
        const message = existingDraftId 
          ? '💾 Draft updated! Your progress has been saved.'
          : '💾 Integration saved as draft! You can finish setting it up later.'
        toast.success(message)
        
        // Refresh the integrations list to show updated data
        queryClient.invalidateQueries({ queryKey: ['integrations'] })
        
        // Navigate back to integrations page
        navigate('/integrations')
      }
    } catch (error: any) {
      console.error('❌ Draft save failed:', error)
      
      if (error.response?.status === 401) {
        toast.error('Authentication failed. Please log in again.')
        navigate('/login')
        return
      }
      
      if (error.response?.status === 400) {
        const errorDetails = error.response.data?.error || 'Validation failed'
        toast.error(`Draft save failed: ${errorDetails}`)
        return
      }
      
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error occurred'
      toast.error(`Failed to save draft: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuthConnect = async (provider: string) => {
    // Save current wizard state before OAuth redirect
    const stateToSave = {
      config,
      currentStep,
      retellApiKey,
      timestamp: Date.now()
    }
    localStorage.setItem('integrationWizardState', JSON.stringify(stateToSave))

    try {
      if (!user?.id) {
        toast.error('Please log in to connect your CRM account')
        return
      }
      
      // Get the OAuth URL from the backend (using accounts endpoint for CRM connections)
      const response = await api.get(`/accounts/oauth/${provider}/auth-url?userId=${user.id}`)
      const data = response.data
      
      if (data.success && data.data.authUrl) {
        // Redirect to the OAuth provider
        window.location.href = data.data.authUrl
      } else {
        throw new Error('Failed to get OAuth URL from backend')
      }
    } catch (error) {
      console.error('OAuth connection error:', error)
      toast.error('Failed to connect to ' + provider + '. Please try again.')
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Basic Information
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Integration Name
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g., Sales Calls to Pipedrive"
                value={config.name}
                onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder="Describe what this integration does..."
                value={config.description}
                onChange={(e) => setConfig(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <LinkIcon className="h-5 w-5 text-blue-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    About Retell Sync Integrations
                  </h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <p>
                      Connect your Retell AI voice agents with CRM systems to automatically sync call data,
                      create leads, update contacts, and trigger follow-up activities.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Show restore option if available */}
            {savedState && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <DocumentCheckIcon className="h-5 w-5 text-yellow-400" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">
                        Continue Where You Left Off
                      </h3>
                      <div className="mt-1 text-sm text-yellow-700">
                        <p>We found a previous wizard session from {new Date(savedState.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={restoreState}
                    className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded text-sm hover:bg-yellow-200"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}
          </div>
        )

      case 1: // Connect Accounts  
        return (
          <div className="space-y-8">
            {/* Retell AI Account */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3">
                  🎙️
                </div>
                Retell AI Account
              </h3>
              <div className="card p-4">
                {config.retellAccountId ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                      <span className="text-sm text-gray-900">Connected to Retell AI</span>
                    </div>
                    <button 
                      className="text-sm text-primary-600 hover:text-primary-500"
                      onClick={() => {
                        // Clear API key first to prevent useEffect from triggering agent fetch
                        setRetellApiKey('')
                        setConfig(prev => ({ ...prev, retellAccountId: '', availableAgents: [] }))
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600 mb-3">
                      Enter your Retell API key to connect your account and fetch available agents.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Retell API Key
                        </label>
                        <input
                          type="password"
                          value={retellApiKey}
                          onChange={(e) => setRetellApiKey(e.target.value)}
                          placeholder="key_..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        />
                        {userAccounts?.find((account: any) => 
                          account.provider === 'retell' && account.providerType === 'voice_ai' && account.isActive
                        ) ? null : (
                          <p className="text-xs text-gray-500 mt-1">
                            Find your API key in the Retell AI dashboard under API settings
                          </p>
                        )}
                      </div>
                      <button 
                        className="btn-primary"
                        onClick={async () => {
                          if (!retellApiKey.trim()) {
                            toast.error('Please enter your Retell API key')
                            return
                          }
                          
                          try {
                            setIsLoading(true)
                            
                            // First test the API key
                            await fetchAvailableAgents(retellApiKey)
                            
                            // If successful, create a simple account record  
                            const accountData = {
                              provider: 'retell',
                              providerType: 'voice_ai',
                              accountName: 'Retell AI Account',
                              apiKey: retellApiKey // Send the key to be stored securely
                            }
                            
                            try {
                              const accountResponse = await api.post('/accounts/simple', accountData)
                              if (accountResponse.data.success) {
                                const accountId = accountResponse.data.data.id
                                setConfig(prev => ({ ...prev, retellAccountId: accountId }))
                                toast.success('Connected to Retell AI successfully!')
                              } else {
                                // Fallback to using API key as ID if account creation fails
                                setConfig(prev => ({ ...prev, retellAccountId: retellApiKey }))
                                toast.success('Connected to Retell AI successfully!')
                              }
                            } catch (accountError) {
                              // Fallback to using API key as ID if account creation fails
                              console.warn('Account creation failed, using API key as ID:', accountError)
                              setConfig(prev => ({ ...prev, retellAccountId: retellApiKey }))
                              toast.success('Connected to Retell AI successfully!')
                            }
                            
                          } catch (error) {
                            console.error('Failed to connect:', error)
                            toast.error('Failed to connect. Please check your API key.')
                            setConfig(prev => ({ ...prev, retellAccountId: '' }))
                          } finally {
                            setIsLoading(false)
                          }
                        }}
                        disabled={!retellApiKey.trim() || isLoading}
                      >
                        {isLoading ? (
                          <div className="flex items-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            Connecting...
                          </div>
                        ) : 'Connect'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Agent Selection (appears after Retell AI is connected) */}
            {config.retellAccountId && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  🤖 Select AI Agent to Integrate
                </h3>
                <div className="card p-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Choose which Retell AI agent you want to sync with your CRM. Each agent has different custom analysis fields.
                  </p>
                  
                  {isLoading ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                      <p className="text-sm text-gray-500 mt-2">Loading your agents...</p>
                    </div>
                  ) : config.availableAgents.length > 0 ? (
                    <div className="space-y-3">
                      {config.availableAgents
                        .filter(agent => 
                          agent.description && 
                          !agent.description.includes('Retell AI Agent') &&
                          agent.description.includes('phone number')
                        )
                        .map((agent) => {
                        console.log(`🖥️ UI RENDERING AGENT: ${agent.name} - Description: "${agent.description}"`)
                        return (
                        <div
                          key={agent.id || agent.agent_id}
                          className={`relative rounded-lg border cursor-pointer p-4 transition-all ${
                            config.selectedAgentId === agent.agent_id
                              ? 'border-primary-500 ring-2 ring-primary-500 bg-primary-50'
                              : agent.active 
                                ? 'border-gray-300 hover:border-gray-400 bg-white' 
                                : 'border-gray-200 bg-gray-50 opacity-75'
                          }`}
                          onClick={() => {
                            if (agent.active) {
                              setConfig(prev => ({ 
                                ...prev, 
                                selectedAgentId: agent.agent_id,
                                integrationType: agent.integrationType || 'both',
                                // Auto-apply MVP business logic based on integration type
                                businessWorkflows: [{
                                  id: 'mvp_webhook_processing',
                                  name: 'MVP Webhook Processing',
                                  trigger: { event: 'call_analyzed' },
                                  conditions: [],
                                  actions: getMVPActionsForType(agent.integrationType),
                                  enabled: true
                                }],
                                fieldMappings: [
                                  // Auto-map essential fields
                                  { sourceField: 'call_analysis.call_summary', targetField: 'activity.note', required: true, source: 'retell' },
                                  { sourceField: 'retell_llm_dynamic_variables.customer_phone', targetField: 'person.phone', required: false, source: 'retell' },
                                  { sourceField: 'retell_llm_dynamic_variables.customer_full_name', targetField: 'person.name', required: false, source: 'retell' }
                                ]
                              }))
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <div className="flex-shrink-0">
                                <div className={`w-3 h-3 rounded-full mr-3 ${
                                  agent.active ? 'bg-green-400' : 'bg-gray-400'
                                }`}></div>
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900 flex items-center">
                                  {agent.name}
                                  {!agent.active && <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">Inactive</span>}
                                  {agent.isSameAgent !== undefined && (
                                    <div className="ml-2 flex items-center space-x-1">
                                      {agent.isSameAgent ? (
                                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex items-center">
                                          📞📲 All Calls
                                        </span>
                                      ) : (
                                        <>
                                          {agent.inboundAgent && (
                                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center">
                                              📞 {agent.inboundAgent.name}
                                            </span>
                                          )}
                                          {agent.outboundAgent && (
                                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center">
                                              📲 {agent.outboundAgent.name}
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {/* Enhanced phone number display */}
                                  {agent.description && agent.description.includes('Handles') && agent.description.includes('phone number') ? (
                                    <div>
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                          📞 {agent.description.match(/Handles (\d+) phone number/)?.[1] || '1'} Number{agent.description.includes('phone numbers:') ? 's' : ''}
                                        </span>
                                      </div>
                                      <div className="space-y-1">
                                        {agent.description.split(': ')[1]?.split(', ').map((phoneInfo, index) => (
                                          <div key={index} className="font-mono text-sm text-blue-700 font-semibold">
                                            {phoneInfo}
                                          </div>
                                        )) || <div className="font-mono text-sm text-blue-700 font-semibold">Phone numbers assigned</div>}
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      {agent.description}
                                      {agent.phoneNumber && (
                                        <div className="mt-1">
                                          <span className="text-blue-600">Phone: </span>
                                          <span className="font-mono">{agent.phoneNumberPretty}</span>
                                          {agent.nickname && <span className="ml-2 text-gray-400">({agent.nickname})</span>}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              <div>{agent.call_count} calls</div>
                              <div>Last: {agent.last_call}</div>
                              <div className="relative group">
                                <span className="text-primary-600 font-medium cursor-help">
                                  {agent.customFieldsCount || 0} custom fields
                                </span>
                                {agent.fieldsByCategory && (agent.fieldsByCategory.variables.size + agent.fieldsByCategory.metadata.size + agent.fieldsByCategory.analysis.size) > 0 && (
                                  <div className="absolute bottom-full right-0 mb-2 w-80 bg-white text-gray-800 text-sm rounded-lg shadow-xl border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
                                    <div className="p-4">
                                      <div className="font-semibold text-gray-900 mb-3 flex items-center">
                                        <span className="w-2 h-2 bg-primary-500 rounded-full mr-2"></span>
                                        Custom Fields Detected
                                      </div>
                                      
                                      {agent.fieldsByCategory.variables.size > 0 && (
                                        <div className="mb-3">
                                          <div className="flex items-center mb-1">
                                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></span>
                                            <span className="font-medium text-blue-700">Dynamic Variables ({agent.fieldsByCategory.variables.size})</span>
                                          </div>
                                          <div className="ml-3.5 text-gray-600 text-xs">
                                            {Array.from(agent.fieldsByCategory.variables).map((field, idx) => (
                                              <span key={idx} className="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded mr-1 mb-1">{field}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {agent.fieldsByCategory.metadata.size > 0 && (
                                        <div className="mb-3">
                                          <div className="flex items-center mb-1">
                                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2"></span>
                                            <span className="font-medium text-green-700">Metadata ({agent.fieldsByCategory.metadata.size})</span>
                                          </div>
                                          <div className="ml-3.5 text-gray-600 text-xs">
                                            {Array.from(agent.fieldsByCategory.metadata).map((field, idx) => (
                                              <span key={idx} className="inline-block bg-green-50 text-green-700 px-2 py-0.5 rounded mr-1 mb-1">{field}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {agent.fieldsByCategory.analysis.size > 0 && (
                                        <div className="mb-1">
                                          <div className="flex items-center mb-1">
                                            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-2"></span>
                                            <span className="font-medium text-purple-700">Analysis Data ({agent.fieldsByCategory.analysis.size})</span>
                                          </div>
                                          <div className="ml-3.5 text-gray-600 text-xs">
                                            {Array.from(agent.fieldsByCategory.analysis).map((field, idx) => (
                                              <span key={idx} className="inline-block bg-purple-50 text-purple-700 px-2 py-0.5 rounded mr-1 mb-1">{field}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {config.selectedAgentId === agent.agent_id && (
                            <div className="absolute inset-0 flex items-center justify-center bg-primary-50 bg-opacity-50 rounded-lg pointer-events-none">
                              <CheckIcon className="h-8 w-8 text-primary-600" />
                            </div>
                          )}
                          
                          {!agent.active && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50 rounded-lg">
                              <div className="text-sm text-gray-500">Agent is inactive</div>
                            </div>
                          )}
                        </div>
                        );
                      })}
                      
                      {config.selectedAgentId && (
                        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex items-center">
                            <CheckIcon className="h-5 w-5 text-green-600 mr-2" />
                            <div className="text-sm font-medium text-green-900">
                              Agent Selected: {config.availableAgents.find(a => a.agent_id === config.selectedAgentId)?.name}
                            </div>
                          </div>
                          <div className="text-xs text-green-700 mt-1">
                            Custom fields will be discovered automatically in the next step.
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="text-sm text-gray-500">No agents found. Please check your API key.</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CRM Selection */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Choose CRM Provider</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {CRM_PROVIDERS.map((provider) => (
                  <div
                    key={provider.id}
                    className={`relative rounded-lg border cursor-pointer p-4 ${
                      config.crmProvider === provider.id
                        ? 'border-primary-500 ring-2 ring-primary-500'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    onClick={() => setConfig(prev => ({ ...prev, crmProvider: provider.id, crmAccountId: '' }))}
                  >
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">{provider.logo}</span>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{provider.name}</div>
                        <div className="text-xs text-gray-500">{provider.description}</div>
                      </div>
                    </div>
                    {config.crmProvider === provider.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-primary-50 bg-opacity-50 rounded-lg">
                        <CheckIcon className="h-8 w-8 text-primary-600" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* CRM Account Connection */}
            {config.crmProvider && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <span className="mr-2">{CRM_PROVIDERS.find(p => p.id === config.crmProvider)?.logo}</span>
                  {CRM_PROVIDERS.find(p => p.id === config.crmProvider)?.name} Account
                </h3>
                <div className="card p-4">
                  {config.crmAccountId ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                        <span className="text-sm text-gray-900">Connected: {config.crmAccountId}</span>
                      </div>
                      <button 
                        className="text-sm text-primary-600 hover:text-primary-500"
                        onClick={() => setConfig(prev => ({ ...prev, crmAccountId: '' }))}
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-gray-600 mb-3">
                        Connect your {CRM_PROVIDERS.find(p => p.id === config.crmProvider)?.name} account to sync call data.
                      </p>
                      <button 
                        className="btn-primary"
                        onClick={() => handleOAuthConnect(config.crmProvider)}
                      >
                        Connect {CRM_PROVIDERS.find(p => p.id === config.crmProvider)?.name}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )

      case 2: // What This Does
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">🎯 How Your Calls Will Be Processed</h3>
              <p className="text-sm text-gray-600 mb-6">
                Your integration will automatically handle every call with smart, proven workflows.
              </p>
            </div>

            {/* Flow Description */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h4 className="text-base font-medium text-blue-900 mb-4">✨ What Happens Automatically:</h4>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-800 font-medium mr-4 mt-0.5">1</div>
                  <div>
                    <h5 className="font-medium text-blue-900">Smart Contact Matching</h5>
                    <p className="text-sm text-blue-700">Find existing contacts by phone → email → create new if needed</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-800 font-medium mr-4 mt-0.5">2</div>
                  <div>
                    <h5 className="font-medium text-blue-900">Call Activity Logging</h5>
                    <p className="text-sm text-blue-700">Every call logged as activity with transcript, duration, and recording link</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-800 font-medium mr-4 mt-0.5">3</div>
                  <div>
                    <h5 className="font-medium text-blue-900">Automatic Direction Detection</h5>
                    <p className="text-sm text-blue-700">Inbound vs outbound calls automatically detected and labeled</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-800 font-medium mr-4 mt-0.5">4</div>
                  <div>
                    <h5 className="font-medium text-green-900">Smart Deal Creation</h5>
                    <p className="text-sm text-green-700">Deals created ONLY for successful calls with smart titles like "John Smith - Consultation" and call summary notes with next steps</p>
                  </div>
                </div>
              </div>
            </div>

            {/* What This Means */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-green-900 mb-2">💡 This Means:</h4>
              <ul className="text-sm text-green-800 space-y-1">
                <li>• ✅ <strong>Successful calls</strong> → Contact + Activity + Deal</li>
                <li>• ❌ <strong>Failed calls</strong> → Contact + Activity (no deal)</li>  
                <li>• 📞 <strong>Unanswered calls</strong> → Contact + Activity (no deal)</li>
                <li>• 🔄 <strong>No manual work</strong> → Everything happens automatically</li>
              </ul>
            </div>
          </div>
        )

      case 3: // Pipeline & Stage Selection
        console.log('🔍 Step 4 (Pipeline Selection) check:', {
          crmProvider: config.crmProvider,
          crmAccountId: config.crmAccountId,
          hasCrmSchema: !!crmSchema,
          hasPipelines: !!crmSchema?.pipelines,
          pipelinesCount: crmSchema?.pipelines?.length || 0
        })
        
        if (config.crmProvider !== 'pipedrive' || !crmSchema?.pipelines) {
          return (
            <div className="space-y-6">
              <div className="text-center py-8">
                <p className="text-gray-500">Pipeline selection is only available for Pipedrive integrations with connected accounts.</p>
                <div className="mt-4 text-xs text-gray-400">
                  Debug: Provider={config.crmProvider}, AccountId={config.crmAccountId}, Schema={!!crmSchema}, Pipelines={!!crmSchema?.pipelines}
                </div>
              </div>
            </div>
          )
        }
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Choose Deal Destination</h3>
              <p className="text-sm text-gray-600 mb-6">
                When your AI successfully books a meeting, where should the deal be created in your pipeline?
              </p>
            </div>

            {/* Pipeline Selection */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sales Pipeline
                </label>
                <select
                  className="input w-full"
                  value={config.selectedPipelineId || ''}
                  onChange={(e) => {
                    console.log('🔄 Pipeline selected:', e.target.value)
                    setConfig(prev => ({
                      ...prev,
                      selectedPipelineId: e.target.value,
                      selectedStageId: '' // Reset stage when pipeline changes
                    }))
                  }}
                >
                  <option value="">Select a pipeline...</option>
                  {crmSchema.pipelines.map((pipeline: any) => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Stage Selection - Only show if pipeline is selected */}
              {config.selectedPipelineId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pipeline Stage
                  </label>
                  <select
                    className="input w-full"
                    value={config.selectedStageId || ''}
                    onChange={(e) => {
                      console.log('🎯 Stage selected:', e.target.value)
                      setConfig(prev => ({ ...prev, selectedStageId: e.target.value }))
                    }}
                  >
                    <option value="">Select a stage...</option>
                    {crmSchema.stages
                      ?.filter((stage: any) => stage.pipeline_id?.toString() === config.selectedPipelineId?.toString())
                      .map((stage: any) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))
                    }
                  </select>
                </div>
              )}
            </div>

            {/* Preview of Selection */}
            {config.selectedPipelineId && config.selectedStageId && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-900 mb-2">✅ Deal Destination Configured</h4>
                <p className="text-sm text-green-800">
                  Successful calls will create deals in <strong>
                    {crmSchema.pipelines.find((p: any) => p.id.toString() === config.selectedPipelineId)?.name}
                  </strong> at stage <strong>
                    {crmSchema.stages.find((s: any) => s.id.toString() === config.selectedStageId)?.name}
                  </strong>
                </p>
              </div>
            )}
          </div>
        )

      case 4: // Review & Complete Setup
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Review Configuration</h3>
              <p className="text-sm text-gray-600">
                Review your integration settings and test the connection before going live.
              </p>
            </div>

            {/* Configuration Summary */}
            <div className="space-y-4">
              <div className="card p-4">
                <h4 className="font-medium text-gray-900 mb-2">Basic Information</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><strong>Name:</strong> {config.name || 'Untitled Integration'}</p>
                  <p><strong>Description:</strong> {config.description || 'No description'}</p>
                </div>
              </div>

              <div className="card p-4">
                <h4 className="font-medium text-gray-900 mb-2">Connected Accounts</h4>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-2 ${config.retellAccountId ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    <span className="text-sm">Retell AI: {config.retellAccountId ? 'Connected' : 'Not connected'}</span>
                  </div>
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-2 ${config.crmAccountId ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    <span className="text-sm">
                      {config.crmProvider ? CRM_PROVIDERS.find(p => p.id === config.crmProvider)?.name : 'CRM'}: {config.crmAccountId || 'Not connected'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Webhook URL Instructions - Only show AFTER integration is created */}
              {config.integrationSaved && config.webhookUrl ? (
                <div className="card p-4 bg-green-50 border border-green-200">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        🔗
                      </div>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-green-900 mb-2">✅ Integration Created! Webhook Configured Automatically</h4>
                      <p className="text-sm text-green-800 mb-3">
                        Your Retell AI agent webhook has been automatically updated - no manual copy/paste needed!
                      </p>
                      <div className="bg-white border border-green-300 rounded-md p-3 mb-3">
                        <div className="flex items-center justify-between">
                          <code className="text-sm font-mono text-gray-800 break-all">
                            {config.webhookUrl}
                          </code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(config.webhookUrl)
                              toast.success('Webhook URL copied to clipboard!')
                            }}
                            className="ml-2 px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-green-700">
                        <p className="mb-1"><strong>⚠️ Important:</strong> You MUST publish your agent in Retell AI Dashboard for calls to work</p>
                        <p>Go to Retell AI → Click on your Agent → Click "Publish" in the top right corner to activate the webhook.</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card p-4 bg-yellow-50 border border-yellow-200">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                        ⏳
                      </div>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-yellow-900 mb-2">📋 Ready to Create Integration</h4>
                      <p className="text-sm text-yellow-800">
                        Click "Create Integration" below to automatically configure your Retell agent. 
                        The webhook URL will be updated automatically - you MUST publish your agent afterward in Retell AI (click agent → "Publish" button).
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="card p-4">
                {console.log('🔍 Workflow count debug:', {
                  totalWorkflows: config.businessWorkflows?.length || 0,
                  enabledWorkflows: config.businessWorkflows?.filter(w => w.enabled)?.length || 0,
                  workflowsArray: config.businessWorkflows,
                  sampleWorkflow: config.businessWorkflows?.[0]
                })}
                <h4 className="font-medium text-gray-900 mb-2">Active Workflows ({config.businessWorkflows.filter(w => w.enabled).length})</h4>
                {config.businessWorkflows.filter(w => w.enabled).length > 0 ? (
                  <div className="space-y-2">
                    {config.businessWorkflows.filter(w => w.enabled).map((workflow, index) => (
                      <div key={index} className="text-sm text-gray-600 flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                          <span className="font-medium">{workflow.name}</span>
                          <span className="text-xs text-gray-500 ml-2">({workflow.actions?.length || 0} actions)</span>
                        </div>
                        <button
                          onClick={() => {
                            console.log(`🗑️ Removing workflow:`, workflow.id)
                            setConfig(prev => ({
                              ...prev,
                              businessWorkflows: prev.businessWorkflows.filter(w => w.id !== workflow.id)
                            }))
                          }}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 hover:bg-red-50 rounded transition-colors"
                          title="Remove workflow"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No workflows configured</p>
                )}
              </div>

              <div className="card p-4">
                <h4 className="font-medium text-gray-900 mb-2">Field Mappings ({config.fieldMappings?.length || 0})</h4>
                {console.log('🔍 Final step debug:', {
                  fieldMappingsCount: config.fieldMappings?.length || 0,
                  discoveredFieldsCount: config.discoveredFields?.length || 0,
                  hasCrmSchema: !!crmSchema,
                  crmProvider: config.crmProvider,
                  sampleMapping: config.fieldMappings?.[0],
                  sampleDiscoveredField: config.discoveredFields?.[0]
                })}
                {config.fieldMappings && config.fieldMappings.length > 0 ? (
                  <div className="space-y-2">
                    {config.fieldMappings.map((mapping, index) => (
                      <div key={index} className="text-sm text-gray-600 flex items-center">
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs mr-2">
                          {config.discoveredFields.find(f => f.id === mapping.sourceField)?.name || mapping.sourceField}
                          {config.discoveredFields.find(f => f.id === mapping.sourceField)?.isCustom && " 🎯"}
                          {mapping.booleanValue !== undefined && (
                            <span className="ml-1 text-blue-600 font-semibold">
                              = {mapping.booleanValue ? 'True ✓' : 'False ✗'}
                            </span>
                          )}
                        </span>
                        <ChevronRightIcon className="h-3 w-3 text-gray-400 mx-1" />
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs">
                          {(() => {
                            // Show two-level structure for complex fields
                            if (mapping.targetLevel1 && mapping.targetLevel2) {
                              const level1Name = mapping.targetField === 'activity' ? 
                                crmSchema?.activityTypes?.find((t: any) => t.id.toString() === mapping.targetLevel1)?.name || mapping.targetLevel1 :
                                mapping.targetField === 'deal.pipeline' ?
                                crmSchema?.pipelines?.find((p: any) => p.id.toString() === mapping.targetLevel1)?.name || mapping.targetLevel1 :
                                mapping.targetLevel1
                              
                              const level2Name = mapping.targetField === 'activity' ? 
                                getLevel2Options(mapping.targetField, mapping.targetLevel1).find(opt => opt.value === mapping.targetLevel2)?.name || mapping.targetLevel2 :
                                mapping.targetField === 'deal.pipeline' ?
                                crmSchema?.stages?.find((s: any) => s.id.toString() === mapping.targetLevel2)?.name || mapping.targetLevel2 :
                                mapping.targetLevel2
                              
                              return `${level1Name}: ${level2Name}`
                            }
                            
                            // Regular field display
                            return config.crmProvider && crmSchema && getDynamicCrmFields().find(f => f.id === mapping.targetField)?.name || mapping.targetField
                          })()}
                        </span>
                        {mapping.required && <span className="ml-2 text-xs text-red-600">*required</span>}
                        {mapping.transform && <span className="ml-2 text-xs text-blue-600">({mapping.transform})</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No field mappings configured</p>
                )}
              </div>

              <div className="card p-4">
                <h4 className="font-medium text-gray-900 mb-2">Sync Settings</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><strong>Frequency:</strong> {config.syncFrequency}</p>
                  <p><strong>Webhook:</strong> <span className="font-mono text-xs">{config.webhookUrl}</span></p>
                  <p><strong>Status:</strong> {config.enabled ? 'Enabled' : 'Disabled'}</p>
                </div>
              </div>
            </div>

          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Edit Integration' : 'Create New Integration'}
        </h1>
        <p className="text-gray-600">
          Connect Retell AI voice agents with your CRM to automatically sync call data.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => (
            <Step
              key={step.id}
              title={step.title}
              description={step.description}
              stepNumber={index + 1}
              isActive={index === currentStep}
              isCompleted={index < currentStep}
            />
          ))}
        </div>
        <div className="mt-4 bg-gray-200 rounded-full h-2">
          <div
            className="bg-primary-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="card p-8 mb-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">{STEPS[currentStep].title}</h2>
          <p className="text-gray-600">{STEPS[currentStep].description}</p>
        </div>
        
        <div key={`step-${currentStep}-${renderKey}`}>
          {renderStepContent()}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {currentStep === 0 ? (
            <button
              onClick={startOver}
              className="btn-outline text-red-600 border-red-300 hover:bg-red-50"
            >
              🔄 Start Over
            </button>
          ) : (
            <button
              onClick={prevStep}
              className="btn-outline"
              disabled={currentStep === 0}
            >
              Previous
            </button>
          )}
          
          {/* Emergency Clear State Button - Always Visible */}
          <button
            onClick={() => {
              if (confirm('⚠️ This will clear all saved data and start fresh. Are you sure?')) {
                startOver()
                window.location.reload()
              }
            }}
            className="btn-outline text-orange-600 border-orange-300 hover:bg-orange-50 text-sm"
            title="Clear localStorage and fix sync issues"
          >
            🧹 Clear State & Reload
          </button>
        </div>
        
        <div className="flex space-x-3">
          {currentStep === STEPS.length - 1 ? (
            config.integrationSaved ? (
              // Show after integration is saved
              <>
                <button 
                  onClick={() => {
                    // Clear saved state and start fresh
                    localStorage.removeItem('integrationWizardState')
                    localStorage.removeItem('integration_wizard_state')
                    window.location.reload()
                  }} 
                  className="btn-outline"
                >
                  Create Another Integration
                </button>
                <button onClick={() => navigate('/integrations')} className="btn-primary">
                  View Integrations
                </button>
              </>
            ) : (
              // Show before integration is saved
              <>
                <button 
                  onClick={handleSaveAsDraft}
                  className="btn-outline"
                  disabled={isLoading}
                >
                  {isLoading ? 
                    (isEditingDraft ? 'Saving Draft...' : 'Saving Changes...') : 
                    (isEditingDraft ? 'Save as Draft' : 'Save Changes')
                  }
                </button>
                <button 
                  onClick={() => {
                    console.log('🔴 BUTTON CLICKED - handleSave will be called')
                    handleSave()
                  }} 
                  className="btn-primary" 
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating...' : (isEditing ? 'Update Integration' : 'Create Integration')}
                </button>
              </>
            )
          ) : (
            // Show for steps 1-3 (not the final step)
            <>
              {(currentStep > 0 || (currentStep === 0 && config.name)) && (
                <button 
                  onClick={handleSaveAsDraft}
                  className="btn-outline mr-3"
                  disabled={isLoading || (currentStep === 0 && !config.name)}
                >
                  {isLoading ? 
                    (isEditingDraft ? 'Saving Draft...' : 'Saving Changes...') : 
                    (isEditingDraft ? 'Save as Draft' : 'Save Changes')
                  }
                </button>
              )}
              <button
                onClick={nextStep}
                className="btn-primary"
                disabled={currentStep === 0 && !config.name}
              >
                Next Step
              </button>
            </>
          )}
        </div>
      </div>

      {/* Simple Workflow Preview Modal */}
      {showWorkflowModal && editingWorkflow && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full m-4">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Ready to Use!</h2>
                  <p className="text-sm text-gray-600 mt-1">This workflow will run automatically when your AI successfully books a meeting</p>
                </div>
                <button
                  onClick={() => setShowWorkflowModal(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* What it does */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-medium text-green-900 mb-3">✨ Here's what happens automatically:</h3>
                <div className="space-y-2 text-sm text-green-800">
                  <div className="flex items-center">
                    <div className="w-6 h-6 bg-green-200 rounded-full flex items-center justify-center text-xs font-medium mr-3">1</div>
                    <span>Creates a new deal in {config.crmProvider} with the customer's info</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-6 h-6 bg-green-200 rounded-full flex items-center justify-center text-xs font-medium mr-3">2</div>
                    <span>Links the customer to the deal</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-6 h-6 bg-green-200 rounded-full flex items-center justify-center text-xs font-medium mr-3">3</div>
                    <span>Logs the call transcript and notes</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-6 h-6 bg-green-200 rounded-full flex items-center justify-center text-xs font-medium mr-3">4</div>
                    <span>Updates the customer's status to "Meeting Scheduled"</span>
                  </div>
                </div>
              </div>

              {/* Simple settings */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">⚙️ Basic Settings</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Deal Name Template
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    defaultValue="Meeting with {{customer_name}}"
                    placeholder="e.g., Consultation with John"
                  />
                  <p className="text-xs text-gray-500 mt-1">Uses the customer name from your AI call</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Deal Stage
                  </label>
                  <select className="input w-full">
                    <option>Meeting Scheduled</option>
                    <option>Qualified Lead</option>
                    <option>Proposal</option>
                    <option>Negotiation</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <button
                  type="button"
                  className="text-gray-500 hover:text-gray-700 text-sm"
                  onClick={() => setShowWorkflowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary px-6"
                  onClick={() => {
                    setConfig(prev => ({
                      ...prev,
                      businessWorkflows: [...prev.businessWorkflows, editingWorkflow]
                    }));
                    setShowWorkflowModal(false);
                  }}
                >
                  Enable This Workflow
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}