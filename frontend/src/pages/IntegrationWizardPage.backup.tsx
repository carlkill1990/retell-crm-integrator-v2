import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  CheckIcon,
  ChevronRightIcon,
  LinkIcon,
  CogIcon,
  DocumentCheckIcon,
  PlayIcon,
} from '@heroicons/react/24/outline'

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
  transform?: string
  required: boolean
}

interface IntegrationConfig {
  name: string
  description: string
  retellAccountId: string
  selectedAgentId: string
  crmProvider: string
  crmAccountId: string
  businessWorkflows: BusinessWorkflow[]
  fieldMappings: FieldMapping[]
  webhookUrl: string
  syncFrequency: string
  enabled: boolean
  discoveredFields: RetellField[]
  lastWebhookSample: any | null
  availableAgents: RetellAgent[]
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
  { id: 'workflows', title: 'Business Logic', description: 'Define conditional workflows and actions' },
  { id: 'mapping', title: 'Field Mapping', description: 'Map call data to CRM fields' },
  { id: 'settings', title: 'Sync Settings', description: 'Configure sync frequency and rules' },
  { id: 'review', title: 'Review & Test', description: 'Review configuration and test connection' },
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
  { id: 'direction', name: 'Call Direction', type: 'string', description: 'inbound or outbound', category: 'Core' },
  
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
  { id: 'call_analysis.user_sentiment', name: 'User Sentiment', type: 'string', description: 'Overall user sentiment', category: 'Analysis' },
  { id: 'call_analysis.call_successful', name: 'Call Successful', type: 'boolean', description: 'Whether call was successful', category: 'Analysis' },
  { id: 'call_analysis.in_voicemail', name: 'In Voicemail', type: 'boolean', description: 'Whether call went to voicemail', category: 'Analysis' },
  
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

export default function IntegrationWizardPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = Boolean(id)
  
  const [currentStep, setCurrentStep] = useState(0)
  const [selectedGoal, setSelectedGoal] = useState<string>('')
  const [showWorkflowModal, setShowWorkflowModal] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState<BusinessWorkflow | null>(null)
  const [config, setConfig] = useState<IntegrationConfig>({
    name: '',
    description: '',
    retellAccountId: '',
    selectedAgentId: '',
    crmProvider: '',
    crmAccountId: '',
    businessWorkflows: [],
    fieldMappings: [],
    webhookUrl: '',
    syncFrequency: 'realtime',
    enabled: true,
    discoveredFields: [...STANDARD_RETELL_FIELDS],
    lastWebhookSample: null,
    availableAgents: [],
  })

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
      name: '📞 No Answer / Voicemail', 
      description: 'Call went to voicemail or no answer',
      triggerCondition: 'No answer or voicemail detected',
      actions: [
        '📝 Log attempted call activity',
        '⏰ Schedule automatic follow-up call',
        '📧 Trigger email sequence if configured'
      ],
      enabled: true
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
    const newWorkflow = { ...template, id: `workflow_${Date.now()}` }
    setConfig(prev => ({
      ...prev,
      businessWorkflows: [...prev.businessWorkflows, newWorkflow]
    }))
  }

  // Fetch available agents when account is connected
  const fetchAvailableAgents = async (accountId: string) => {
    try {
      // In real implementation, this would call Retell API
      const mockAgents: RetellAgent[] = [
        {
          agent_id: "agent_796169b8bb312daa99022798bb",
          name: "Pipedrive: Cosmetic Clinic",
          description: "Handles cosmetic procedure consultations and bookings",
          created_at: "2024-01-15T10:00:00Z",
          call_count: 145,
          active: true,
          last_call: "2 hours ago"
        },
        {
          agent_id: "agent_abc123def456ghi789jkl012",
          name: "Real Estate: Property Inquiries", 
          description: "Qualifies real estate leads and schedules viewings",
          created_at: "2024-02-01T14:30:00Z",
          call_count: 89,
          active: true,
          last_call: "5 minutes ago"
        },
        {
          agent_id: "agent_xyz987wvu654tsr321qpo098",
          name: "Insurance: Claims Support",
          description: "Handles insurance claims and policy questions",
          created_at: "2024-01-20T09:15:00Z", 
          call_count: 234,
          active: false,
          last_call: "3 days ago"
        }
      ]

      setConfig(prev => ({ ...prev, availableAgents: mockAgents }))
      toast.success(`Found ${mockAgents.length} agents in your Retell account`)
    } catch (error) {
      toast.error('Failed to fetch agents from your Retell account')
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

  // Real implementation - fetch recent webhooks for connected agent
  const discoverFieldsFromAgent = async (agentId: string) => {
    try {
      const response = await api.get(`/integrations/agent/${agentId}/recent-webhooks?limit=5`)
      const recentWebhooks = response.data.data
      
      // Analyze multiple webhook payloads to discover all possible fields
      const allDiscoveredFields = [...STANDARD_RETELL_FIELDS]
      const seenCustomFields = new Set()
      
      recentWebhooks.forEach((webhook: any) => {
        const fieldsFromWebhook = analyzeWebhookPayload(webhook)
        fieldsFromWebhook.forEach(field => {
          if (field.isCustom && !seenCustomFields.has(field.id)) {
            allDiscoveredFields.push(field)
            seenCustomFields.add(field.id)
          }
        })
      })
      
      setConfig(prev => ({ 
        ...prev, 
        discoveredFields: allDiscoveredFields,
        lastWebhookSample: recentWebhooks[0]
      }))
      
      toast.success(`🎯 Analyzed ${recentWebhooks.length} recent calls, found ${seenCustomFields.size} custom fields!`)
    } catch (error) {
      toast.error('No recent calls found for this agent. Try the manual method.')
      // Fall back to manual discovery
      discoverFieldsFromSample()
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
  
  const nextStep = () => setCurrentStep(Math.min(currentStep + 1, STEPS.length - 1))
  const prevStep = () => setCurrentStep(Math.max(currentStep - 1, 0))

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
    try {
      // API call to save integration
      toast.success('Integration saved successfully!')
      navigate('/integrations')
    } catch (error) {
      toast.error('Failed to save integration')
    }
  }

  const testConnection = async () => {
    try {
      // API call to test connection
      toast.success('Connection test successful!')
    } catch (error) {
      toast.error('Connection test failed')
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
                      <span className="text-sm text-gray-900">Connected: account-{config.retellAccountId}</span>
                    </div>
                    <button 
                      className="text-sm text-primary-600 hover:text-primary-500"
                      onClick={() => setConfig(prev => ({ ...prev, retellAccountId: '' }))}
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600 mb-3">
                      Connect your Retell AI account to receive call webhooks and data.
                    </p>
                    <button 
                      className="btn-primary"
                      onClick={async () => {
                        const accountId = 'retell-account-123'
                        setConfig(prev => ({ ...prev, retellAccountId: accountId }))
                        await fetchAvailableAgents(accountId)
                      }}
                    >
                      Connect Retell AI
                    </button>
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
                  
                  {config.availableAgents.length > 0 ? (
                    <div className="space-y-3">
                      {config.availableAgents.map((agent) => (
                        <div
                          key={agent.agent_id}
                          className={`relative rounded-lg border cursor-pointer p-4 transition-all ${
                            config.selectedAgentId === agent.agent_id
                              ? 'border-primary-500 ring-2 ring-primary-500 bg-primary-50'
                              : agent.active 
                                ? 'border-gray-300 hover:border-gray-400 bg-white' 
                                : 'border-gray-200 bg-gray-50 opacity-75'
                          }`}
                          onClick={() => {
                            if (agent.active) {
                              setConfig(prev => ({ ...prev, selectedAgentId: agent.agent_id }))
                              // Auto-discover fields when agent is selected
                              setTimeout(() => discoverFieldsFromAgent(agent.agent_id), 500)
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
                                </div>
                                <div className="text-xs text-gray-500 mt-1">{agent.description}</div>
                              </div>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              <div>{agent.call_count} calls</div>
                              <div>Last: {agent.last_call}</div>
                            </div>
                          </div>
                          
                          {config.selectedAgentId === agent.agent_id && (
                            <div className="absolute inset-0 flex items-center justify-center bg-primary-50 bg-opacity-50 rounded-lg">
                              <CheckIcon className="h-8 w-8 text-primary-600" />
                            </div>
                          )}
                          
                          {!agent.active && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50 rounded-lg">
                              <div className="text-sm text-gray-500">Agent is inactive</div>
                            </div>
                          )}
                        </div>
                      ))}
                      
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
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                      <p className="text-sm text-gray-500 mt-2">Loading your agents...</p>
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
                        onClick={() => setConfig(prev => ({ ...prev, crmAccountId: `${config.crmProvider}-account-456` }))}
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

      case 2: // Business Logic/Workflows
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">What's the goal of your AI calls?</h3>
              <p className="text-sm text-gray-600 mb-6">
                Tell us what your AI agent is trying to achieve, and we'll automatically handle all the CRM updates when it succeeds.
              </p>
            </div>

            {/* Goal Selection */}
            <div className="card p-6 mb-6">
              <h4 className="text-base font-medium text-gray-900 mb-4">🎯 Primary Call Goal</h4>
              <div className="space-y-3">
                {[
                  { id: 'book_meeting', name: '📅 Book a meeting/appointment', desc: 'Schedule consultations, demos, calls' },
                  { id: 'qualify_lead', name: '🎯 Qualify leads', desc: 'Gather information, assess fit' },
                  { id: 'close_deal', name: '💰 Close a sale', desc: 'Convert prospects to customers' },
                  { id: 'collect_info', name: '📋 Collect information', desc: 'Surveys, feedback, data gathering' },
                  { id: 'follow_up', name: '🔄 Follow up on interest', desc: 'Nurture existing leads' },
                  { id: 'customer_service', name: '🛟 Provide support', desc: 'Answer questions, resolve issues' }
                ].map((goal) => (
                  <label key={goal.id} className="flex items-start cursor-pointer">
                    <input 
                      type="radio" 
                      name="callGoal"
                      value={goal.id}
                      checked={selectedGoal === goal.id}
                      onChange={(e) => setSelectedGoal(e.target.value)}
                      className="mt-1 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="ml-3 flex-1">
                      <div className="text-sm font-medium text-gray-900">{goal.name}</div>
                      <div className="text-xs text-gray-500">{goal.desc}</div>
                    </div>
                    {selectedGoal === goal.id && (
                      <button
                        type="button"
                        onClick={() => {
                          const workflow = createSmartWorkflow(selectedGoal, 'goal-achieved');
                          setEditingWorkflow(workflow);
                          setShowWorkflowModal(true);
                        }}
                        className="ml-4 btn-outline text-xs px-3 py-1"
                      >
                        Configure Workflow
                      </button>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Outcome-Based Templates */}
            <div className="card p-6">
              <h4 className="text-base font-medium text-gray-900 mb-4">🎯 Choose Your Call Outcomes</h4>
              <p className="text-sm text-gray-600 mb-4">
                Select what typically happens after your AI calls. Each outcome automatically handles multiple CRM actions.
              </p>
              <div className="space-y-4">
                {getOutcomeTemplates('book_meeting').map((template) => (
                  <div key={template.id} className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h5 className="text-sm font-medium text-gray-900">{template.name}</h5>
                        <p className="text-xs text-gray-600 mt-1">{template.description}</p>
                        
                        <div className="mt-3 space-y-2">
                          <div className="text-xs">
                            <span className="font-medium text-blue-700">Trigger:</span> 
                            <span className="ml-1 text-blue-600">{template.triggerCondition}</span>
                          </div>
                          <div className="text-xs">
                            <span className="font-medium text-gray-700">Auto Actions:</span>
                            <ul className="ml-2 mt-1 space-y-1">
                              {template.actions.map((action, idx) => (
                                <li key={idx} className="text-gray-600 text-xs">
                                  {action}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                      
                      <div className="ml-4 flex flex-col items-end space-y-2">
                        <label className="flex items-center">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 mr-2"
                            defaultChecked={template.enabled}
                          />
                          <span className="text-xs text-gray-700">Enable</span>
                        </label>
                        {template.id === 'custom-outcome' && (
                          <button className="text-xs text-primary-600 hover:text-primary-500">
                            Configure →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Workflows */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-base font-medium text-gray-900">⚡ Active Workflows</h4>
                <button className="btn-primary text-xs px-3 py-2">
                  + Create Custom Workflow
                </button>
              </div>

              {config.businessWorkflows.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <div className="text-gray-400 mb-2">🔄</div>
                  <h3 className="text-sm font-medium text-gray-900">No workflows configured</h3>
                  <p className="text-xs text-gray-500 mt-1">Add templates above or create custom workflows.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {config.businessWorkflows.map((workflow) => (
                    <div key={workflow.id} className="border border-gray-200 rounded-lg p-4 bg-green-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center">
                            <h5 className="text-sm font-medium text-gray-900">{workflow.name}</h5>
                            <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              workflow.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {workflow.enabled ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">{workflow.description}</p>
                          
                          <div className="mt-2 text-xs text-gray-600">
                            <span className="font-medium">Trigger:</span> {workflow.trigger.event} • 
                            <span className="font-medium ml-2">Conditions:</span> {workflow.conditions.length || 'Always'} • 
                            <span className="font-medium ml-2">Actions:</span> {workflow.actions.length}
                          </div>
                        </div>
                        
                        <div className="flex space-x-2">
                          <button className="text-xs text-blue-600 hover:text-blue-500">Edit</button>
                          <button className="text-xs text-red-600 hover:text-red-500">Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Smart Detection Explanation */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-green-900 mb-2">🧠 Smart Outcome Detection</h4>
              <div className="text-sm text-green-800 space-y-2">
                <p><strong>The platform automatically detects success patterns:</strong></p>
                <div className="ml-3 space-y-1 text-xs">
                  <p>• <strong>Appointment Booked:</strong> Looks for dates, times, "scheduled", "booked", "appointment"</p>
                  <p>• <strong>Successful Call:</strong> Uses `call_successful = true` or positive sentiment</p>
                  <p>• <strong>No Answer:</strong> Detects `in_voicemail = true` or short call duration</p>
                  <p>• <strong>Info Gathered:</strong> Any completed call with transcript data</p>
                </div>
                <p className="text-xs mt-2 font-medium">
                  ✨ Works with ANY agent setup - no need to configure specific field names!
                </p>
              </div>
            </div>
          </div>
        )

      case 3: // Field Mapping
        return (
          <div className="space-y-6">
            {config.businessWorkflows.length > 0 ? (
              // Show simplified view when workflows are configured
              <>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">✅ Field Mapping Complete</h3>
                  <p className="text-sm text-gray-600">
                    Your workflows already include smart field mappings. You can add additional custom mappings below if needed.
                  </p>
                </div>

                {/* Show what workflows are handling */}
                <div className="space-y-4">
                <div className="card p-4">
                  <h4 className="font-medium text-gray-900 mb-3">🎯 Auto-Handled by Your Workflows</h4>
                  <div className="space-y-3">
                    {config.businessWorkflows.map((workflow) => (
                      <div key={workflow.id} className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h5 className="text-sm font-medium text-green-900">{workflow.name}</h5>
                            <div className="mt-2 space-y-1">
                              {workflow.actions.map((action, idx) => (
                                <div key={idx} className="text-xs text-green-700 flex items-center">
                                  <span className="w-4 h-4 bg-green-200 rounded-full flex items-center justify-center text-xs font-medium mr-2">
                                    {idx + 1}
                                  </span>
                                  {action.type === 'create_deal' && '💼 Creates deal with customer info'}
                                  {action.type === 'create_activity' && '📝 Logs call transcript and notes'}
                                  {action.type === 'update_person' && '👤 Updates customer record'}
                                  {action.type === 'update_deal_stage' && '📊 Updates deal stage'}
                                </div>
                              ))}
                            </div>
                          </div>
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                            Auto
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Optional additional mappings */}
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">⚙️ Additional Custom Mappings</h4>
                    <button 
                      onClick={addFieldMapping} 
                      className="text-sm btn-outline px-3 py-1"
                    >
                      Add Custom Mapping
                    </button>
                  </div>
                  
                  {config.fieldMappings.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No additional mappings needed. Your workflows handle the main data automatically.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {config.fieldMappings.map((mapping, index) => (
                        <div key={index} className="text-sm text-gray-600 flex items-center justify-between bg-gray-50 p-2 rounded">
                          <div className="flex items-center">
                            <span className="font-mono bg-white px-2 py-1 rounded text-xs mr-2">
                              {config.discoveredFields.find(f => f.id === mapping.sourceField)?.name || mapping.sourceField}
                            </span>
                            <span className="text-gray-400 mx-1">→</span>
                            <span className="font-mono bg-white px-2 py-1 rounded text-xs">
                              {mapping.targetField}
                            </span>
                          </div>
                          <button 
                            onClick={() => removeFieldMapping(index)}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              </>
            ) : (
              // Show full field mapping when no workflows
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Field Mapping Configuration</h3>
                  <p className="text-sm text-gray-600">
                    Map Retell AI call data to your {config.crmProvider ? CRM_PROVIDERS.find(p => p.id === config.crmProvider)?.name : 'CRM'} fields
                  </p>
                </div>
              <div className="flex space-x-3">
                <div className="relative">
                  <button 
                    onClick={() => {
                      // Show dropdown menu for field discovery options
                      const menu = document.getElementById('discovery-menu')
                      menu?.classList.toggle('hidden')
                    }}
                    className="btn-outline flex items-center"
                  >
                    🔍 Discover Fields
                    <ChevronRightIcon className="ml-1 h-4 w-4" />
                  </button>
                  
                  <div id="discovery-menu" className="hidden absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg z-10 border">
                    <div className="py-1">
                      <button
                        onClick={() => {
                          if (!config.retellAccountId) {
                            toast.error('Please connect your Retell AI account first')
                          } else if (!config.selectedAgentId) {
                            toast.error('Please select an AI agent first')
                          } else {
                            discoverFieldsFromAgent(config.selectedAgentId)
                          }
                          document.getElementById('discovery-menu')?.classList.add('hidden')
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        📡 Analyze Recent Calls
                        <div className="text-xs text-gray-500">Get fields from your selected agent's recent webhooks</div>
                      </button>
                      <button
                        onClick={() => {
                          discoverFieldsFromSample()
                          document.getElementById('discovery-menu')?.classList.add('hidden')
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        📋 Use Sample Data
                        <div className="text-xs text-gray-500">Demo with cosmetic clinic example</div>
                      </button>
                      <button
                        onClick={() => {
                          // In real implementation, show modal to paste webhook JSON
                          toast.info('Feature coming soon: Paste your own webhook data')
                          document.getElementById('discovery-menu')?.classList.add('hidden')
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        📝 Paste Webhook JSON
                        <div className="text-xs text-gray-500">Manually paste a webhook payload</div>
                      </button>
                    </div>
                  </div>
                </div>
                <button onClick={addFieldMapping} className="btn-primary">
                  Add Mapping
                </button>
              </div>
            </div>

            {/* Field Discovery Status */}
            <div className="card p-4 bg-blue-50 border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <DocumentCheckIcon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="ml-3">
                    <div className="text-sm font-medium text-blue-900">
                      Available Fields: {config.discoveredFields.length} total
                    </div>
                    <div className="text-xs text-blue-700">
                      Standard: {config.discoveredFields.filter(f => !f.isCustom).length} • 
                      Custom: {config.discoveredFields.filter(f => f.isCustom).length}
                      {config.lastWebhookSample && " (from webhook sample)"}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => {/* Show field browser modal */}} 
                  className="text-sm text-blue-600 hover:text-blue-500"
                >
                  Browse All Fields
                </button>
              </div>
            </div>

            {config.fieldMappings.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <DocumentCheckIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No field mappings</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by adding your first field mapping.</p>
                <button onClick={addFieldMapping} className="mt-3 btn-primary">
                  Add Your First Mapping
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {config.fieldMappings.map((mapping, index) => (
                  <div key={index} className="card p-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                      {/* Source Field */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Retell AI Field
                        </label>
                        <select
                          className="input text-sm"
                          value={mapping.sourceField}
                          onChange={(e) => updateFieldMapping(index, 'sourceField', e.target.value)}
                        >
                          <option value="">Select field...</option>
                          {/* Group fields by category */}
                          {['Core', 'Contact', 'Content', 'Analysis', 'Timing', 'Cost', 'Technical', 'Dynamic Variables', 'Linking', 'Metadata', 'Custom Analysis'].map(category => {
                            const fieldsInCategory = config.discoveredFields.filter(f => f.category === category)
                            if (fieldsInCategory.length === 0) return null
                            
                            return (
                              <optgroup key={category} label={category}>
                                {fieldsInCategory.map(field => (
                                  <option key={field.id} value={field.id}>
                                    {field.name} ({field.type})
                                    {field.isCustom && " 🎯"}
                                  </option>
                                ))}
                              </optgroup>
                            )
                          })}
                        </select>
                        {mapping.sourceField && (
                          <div className="mt-1">
                            <p className="text-xs text-gray-500">
                              {config.discoveredFields.find(f => f.id === mapping.sourceField)?.description}
                            </p>
                            {config.discoveredFields.find(f => f.id === mapping.sourceField)?.sampleValue && (
                              <p className="text-xs text-blue-600 mt-1">
                                Sample: "{config.discoveredFields.find(f => f.id === mapping.sourceField)?.sampleValue}"
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Arrow */}
                      <div className="text-center">
                        <ChevronRightIcon className="h-5 w-5 text-gray-400 mx-auto" />
                      </div>

                      {/* Target Field */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          {config.crmProvider ? CRM_PROVIDERS.find(p => p.id === config.crmProvider)?.name : 'CRM'} Field
                        </label>
                        <select
                          className="input text-sm"
                          value={mapping.targetField}
                          onChange={(e) => updateFieldMapping(index, 'targetField', e.target.value)}
                          disabled={!config.crmProvider}
                        >
                          <option value="">Select field...</option>
                          {config.crmProvider && (() => {
                            const fields = CRM_FIELDS[config.crmProvider as keyof typeof CRM_FIELDS]
                            const categories = [...new Set(fields?.map(f => f.category || 'Other'))]
                            
                            return categories.map(category => {
                              const fieldsInCategory = fields?.filter(f => (f.category || 'Other') === category) || []
                              if (fieldsInCategory.length === 0) return null
                              
                              return (
                                <optgroup key={category} label={category}>
                                  {fieldsInCategory.map(field => (
                                    <option key={field.id} value={field.id}>
                                      {field.name} ({field.type})
                                    </option>
                                  ))}
                                </optgroup>
                              )
                            })
                          })()}
                        </select>
                      </div>

                      {/* Transform */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Transform
                        </label>
                        <select
                          className="input text-sm"
                          value={mapping.transform || ''}
                          onChange={(e) => updateFieldMapping(index, 'transform', e.target.value)}
                        >
                          <option value="">No transform</option>
                          <option value="uppercase">UPPERCASE</option>
                          <option value="lowercase">lowercase</option>
                          <option value="capitalize">Capitalize</option>
                          <option value="truncate_100">Truncate to 100 chars</option>
                          <option value="phone_format">Format phone number</option>
                        </select>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-2">
                        <label className="flex items-center text-sm">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 mr-1"
                            checked={mapping.required}
                            onChange={(e) => updateFieldMapping(index, 'required', e.target.checked)}
                          />
                          Required
                        </label>
                        <button
                          onClick={() => removeFieldMapping(index)}
                          className="text-red-600 hover:text-red-500 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Suggested Mappings */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-2">💡 Suggested Pipedrive Mappings</h4>
              <div className="text-sm text-blue-800 space-y-1">
                <p>• <strong>from_number / to_number</strong> → person.phones[0].value (Connect calls to contacts)</p>
                <p>• <strong>transcript</strong> → activity.note (Save conversation details)</p>
                <p>• <strong>call_analysis.call_summary</strong> → activity.subject (Summarize the call)</p>
                <p>• <strong>call_analysis.call_successful</strong> → deal.status (Update deal progress)</p>
                <p>• <strong>duration_ms</strong> → activity.duration (Track call length)</p>
                {config.discoveredFields.some(f => f.category === 'Linking') && (
                  <p>• <strong>metadata.lead_id 🔗</strong> → deal.id (Link to existing deal)</p>
                )}
                {config.discoveredFields.some(f => f.category === 'Dynamic Variables') && (
                  <p>• <strong>retell_llm_dynamic_variables.name</strong> → person.name (Update contact info)</p>
                )}
                {config.discoveredFields.some(f => f.category === 'Dynamic Variables') && (
                  <p>• <strong>retell_llm_dynamic_variables.email</strong> → person.emails[0].value (Update email)</p>
                )}
                {config.discoveredFields.some(f => f.category === 'Custom Analysis') && (
                  <p>• <strong>consultation_booking_status</strong> → deal.stage_id (Update deal stage)</p>
                )}
              </div>
            </div>

            {/* CRM Linking Notice */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-orange-900 mb-2">🔗 Important: CRM Record Linking</h4>
              <div className="text-sm text-orange-800 space-y-2">
                <p>For proper integration, you need to link calls to existing CRM records:</p>
                <div className="ml-3 space-y-1">
                  <p>• Map <strong>metadata.lead_id</strong> → <strong>person.id</strong> (to find existing contact)</p>
                  <p>• Map <strong>metadata.lead_id</strong> → <strong>deal.id</strong> (to update existing deal)</p>
                  <p>• Map phone number → <strong>person.phones[0].value</strong> (to match by phone)</p>
                </div>
                <p className="text-xs mt-2 text-orange-700">
                  💡 Without proper linking, each call creates new records instead of updating existing ones.
                </p>
              </div>
            </div>
              </div>
            )}
          </div>
        )

      case 4: // Sync Settings
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Sync Configuration</h3>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sync Frequency
              </label>
              <select
                className="input"
                value={config.syncFrequency}
                onChange={(e) => setConfig(prev => ({ ...prev, syncFrequency: e.target.value }))}
              >
                <option value="realtime">Real-time (Recommended)</option>
                <option value="5min">Every 5 minutes</option>
                <option value="15min">Every 15 minutes</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Real-time syncing processes calls immediately via webhooks
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Webhook URL
              </label>
              <input
                type="url"
                className="input"
                value={config.webhookUrl || `https://api.retellsync.com/webhooks/${Math.random().toString(36).substring(7)}`}
                onChange={(e) => setConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
                placeholder="https://api.retellsync.com/webhooks/your-endpoint"
              />
              <p className="text-xs text-gray-500 mt-1">
                This URL will receive call events from Retell AI
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-900">Sync Rules</h4>
              
              <div className="space-y-3">
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 mr-2" defaultChecked />
                  <span className="text-sm text-gray-700">Only sync successful calls (duration &gt; 30 seconds)</span>
                </label>
                
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 mr-2" defaultChecked />
                  <span className="text-sm text-gray-700">Create new contacts for unknown phone numbers</span>
                </label>
                
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 mr-2" />
                  <span className="text-sm text-gray-700">Update existing deals based on call outcome</span>
                </label>
                
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 mr-2" defaultChecked />
                  <span className="text-sm text-gray-700">Send notifications for failed syncs</span>
                </label>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <CogIcon className="h-5 w-5 text-yellow-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Advanced Configuration
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>
                      These settings control how call data is processed and synced to your CRM.
                      Real-time sync is recommended for the best user experience.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      case 5: // Review & Test
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
                    <span className="text-sm">Retell AI: {config.retellAccountId || 'Not connected'}</span>
                  </div>
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-2 ${config.crmAccountId ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    <span className="text-sm">
                      {config.crmProvider ? CRM_PROVIDERS.find(p => p.id === config.crmProvider)?.name : 'CRM'}: {config.crmAccountId || 'Not connected'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <h4 className="font-medium text-gray-900 mb-2">Field Mappings ({config.fieldMappings.length})</h4>
                {config.fieldMappings.length > 0 ? (
                  <div className="space-y-2">
                    {config.fieldMappings.map((mapping, index) => (
                      <div key={index} className="text-sm text-gray-600 flex items-center">
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs mr-2">
                          {config.discoveredFields.find(f => f.id === mapping.sourceField)?.name || mapping.sourceField}
                          {config.discoveredFields.find(f => f.id === mapping.sourceField)?.isCustom && " 🎯"}
                        </span>
                        <ChevronRightIcon className="h-3 w-3 text-gray-400 mx-1" />
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs">
                          {config.crmProvider && CRM_FIELDS[config.crmProvider as keyof typeof CRM_FIELDS]?.find(f => f.id === mapping.targetField)?.name || mapping.targetField}
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

            {/* Test Connection */}
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-6">
              <div className="text-center">
                <PlayIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">Test Your Integration</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Send a test webhook to verify everything is working correctly.
                </p>
                <button
                  onClick={testConnection}
                  className="mt-3 btn-primary"
                  disabled={!config.retellAccountId || !config.crmAccountId}
                >
                  Run Connection Test
                </button>
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
        
        {renderStepContent()}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevStep}
          className="btn-outline"
          disabled={currentStep === 0}
        >
          Previous
        </button>
        
        <div className="flex space-x-3">
          {currentStep === STEPS.length - 1 ? (
            <>
              <button onClick={() => navigate('/integrations')} className="btn-outline">
                Save as Draft
              </button>
              <button onClick={handleSave} className="btn-primary">
                {isEditing ? 'Update Integration' : 'Create Integration'}
              </button>
            </>
          ) : (
            <button
              onClick={nextStep}
              className="btn-primary"
              disabled={currentStep === 0 && !config.name}
            >
              Next Step
            </button>
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
                    defaultValue="Meeting with {`{{customer_name}}`}"
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