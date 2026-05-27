#!/bin/bash

# Create Admin Dashboard Screen
cat > screens/admin/AdminDashboardScreen.tsx << 'EOF'
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Card } from '../../components/ui/Card';

export default function AdminDashboardScreen({ navigation }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    activeWorkflows: 127,
    completedToday: 45,
    failedWorkflows: 3,
    totalFarmers: 1250,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    // Fetch latest stats from API
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View className="p-4">
        <Text className="text-2xl font-bold mb-6">Workflow Admin</Text>

        <View className="flex-row flex-wrap gap-4 mb-6">
          <Card className="flex-1 min-w-[45%] p-4">
            <Text className="text-sm text-gray-600 mb-2">Active Workflows</Text>
            <Text className="text-3xl font-bold text-blue-600">{stats.activeWorkflows}</Text>
          </Card>

          <Card className="flex-1 min-w-[45%] p-4">
            <Text className="text-sm text-gray-600 mb-2">Completed Today</Text>
            <Text className="text-3xl font-bold text-green-600">{stats.completedToday}</Text>
          </Card>

          <Card className="flex-1 min-w-[45%] p-4">
            <Text className="text-sm text-gray-600 mb-2">Failed</Text>
            <Text className="text-3xl font-bold text-red-600">{stats.failedWorkflows}</Text>
          </Card>

          <Card className="flex-1 min-w-[45%] p-4">
            <Text className="text-sm text-gray-600 mb-2">Total Farmers</Text>
            <Text className="text-3xl font-bold">{stats.totalFarmers}</Text>
          </Card>
        </View>

        <Card className="p-4 mb-4">
          <Text className="text-lg font-bold mb-4">Quick Actions</Text>
          <TouchableOpacity
            className="bg-blue-500 p-4 rounded-lg mb-3"
            onPress={() => navigation.navigate('WorkflowList')}
          >
            <Text className="text-white text-center font-semibold">View All Workflows</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-white border border-gray-300 p-4 rounded-lg mb-3"
            onPress={() => navigation.navigate('AdminAnalytics')}
          >
            <Text className="text-gray-800 text-center font-semibold">View Analytics</Text>
          </TouchableOpacity>
        </Card>

        <Card className="p-4">
          <Text className="text-lg font-bold mb-4">System Health</Text>
          <View className="space-y-2">
            <View className="flex-row justify-between py-2">
              <Text>Temporal Server</Text>
              <Text className="text-green-600 font-semibold">✓ Healthy</Text>
            </View>
            <View className="flex-row justify-between py-2">
              <Text>Kafka</Text>
              <Text className="text-green-600 font-semibold">✓ Healthy</Text>
            </View>
            <View className="flex-row justify-between py-2">
              <Text>Redis</Text>
              <Text className="text-green-600 font-semibold">✓ Healthy</Text>
            </View>
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}
EOF

# Create Workflow List Screen
cat > screens/admin/WorkflowListScreen.tsx << 'EOF'
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Card } from '../../components/ui/Card';

export default function WorkflowListScreen({ navigation }: any) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const workflows = [
    { id: 'wf-001', type: 'Ginger Complete Season', farmer: 'Adebayo O.', status: 'running', progress: 65 },
    { id: 'wf-002', type: 'Palm Oil Cooperative', farmer: 'Chioma N.', status: 'completed', progress: 100 },
    { id: 'wf-003', type: 'Cocoa Export Cert', farmer: 'Ibrahim M.', status: 'failed', progress: 40 },
    { id: 'wf-004', type: 'Cassava Value Chain', farmer: 'Ngozi E.', status: 'running', progress: 80 },
  ];

  const filteredWorkflows = workflows.filter(wf =>
    (filterStatus === 'all' || wf.status === filterStatus) &&
    (wf.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
     wf.farmer.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="p-4">
        <Text className="text-2xl font-bold mb-4">All Workflows</Text>

        <Card className="p-4 mb-4">
          <TextInput
            className="border border-gray-300 rounded-lg p-3 mb-3"
            placeholder="Search workflows..."
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          <View className="flex-row gap-2">
            {['all', 'running', 'completed', 'failed'].map(status => (
              <TouchableOpacity
                key={status}
                className={`px-4 py-2 rounded-lg ${filterStatus === status ? 'bg-blue-500' : 'bg-gray-200'}`}
                onPress={() => setFilterStatus(status)}
              >
                <Text className={filterStatus === status ? 'text-white' : 'text-gray-800'}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {filteredWorkflows.map(wf => (
          <TouchableOpacity
            key={wf.id}
            onPress={() => navigation.navigate('WorkflowDetail', { workflowId: wf.id })}
          >
            <Card className="p-4 mb-3">
              <Text className="text-lg font-bold mb-1">{wf.type}</Text>
              <Text className="text-sm text-gray-600 mb-3">{wf.id} • {wf.farmer}</Text>
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-4">
                  <View className="h-2 bg-gray-200 rounded-full">
                    <View
                      className={`h-2 rounded-full ${
                        wf.status === 'completed' ? 'bg-green-500' :
                        wf.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${wf.progress}%` }}
                    />
                  </View>
                  <Text className="text-xs text-center mt-1">{wf.progress}%</Text>
                </View>
                <View className={`px-3 py-1 rounded-full ${
                  wf.status === 'completed' ? 'bg-green-100' :
                  wf.status === 'failed' ? 'bg-red-100' : 'bg-blue-100'
                }`}>
                  <Text className={
                    wf.status === 'completed' ? 'text-green-800' :
                    wf.status === 'failed' ? 'text-red-800' : 'text-blue-800'
                  }>
                    {wf.status}
                  </Text>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
EOF

# Create Workflow Detail Screen
cat > screens/admin/WorkflowDetailScreen.tsx << 'EOF'
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Card } from '../../components/ui/Card';

export default function WorkflowDetailScreen({ route }: any) {
  const { workflowId } = route.params;

  const workflow = {
    id: workflowId,
    type: 'Ginger Complete Season',
    farmer: 'Adebayo Ogunleye',
    status: 'running',
    progress: 65,
    currentStep: 'Fertilizer Application',
    steps: [
      { name: 'Land Preparation', status: 'completed', duration: '2 days' },
      { name: 'Planting', status: 'completed', duration: '1 day' },
      { name: 'Fertilizer Application', status: 'in_progress', duration: 'ongoing' },
      { name: 'Pest Control', status: 'pending', duration: '-' },
      { name: 'Harvest', status: 'pending', duration: '-' },
    ],
  };

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="p-4">
        <Text className="text-2xl font-bold mb-2">{workflow.type}</Text>
        <Text className="text-gray-600 mb-6">ID: {workflow.id}</Text>

        <View className="flex-row gap-4 mb-6">
          <Card className="flex-1 p-4">
            <Text className="text-sm text-gray-600 mb-2">Status</Text>
            <View className="bg-blue-100 px-3 py-1 rounded-full self-start">
              <Text className="text-blue-800 font-semibold">{workflow.status}</Text>
            </View>
          </Card>

          <Card className="flex-1 p-4">
            <Text className="text-sm text-gray-600 mb-2">Progress</Text>
            <Text className="text-2xl font-bold">{workflow.progress}%</Text>
          </Card>
        </View>

        <Card className="p-4 mb-6">
          <Text className="text-lg font-bold mb-4">Workflow Steps</Text>
          {workflow.steps.map((step, idx) => (
            <View key={idx} className="flex-row items-center mb-4">
              <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                step.status === 'completed' ? 'bg-green-500' :
                step.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-200'
              }`}>
                <Text className={step.status === 'pending' ? 'text-gray-600' : 'text-white'} style={{ fontWeight: 'bold' }}>
                  {idx + 1}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="font-semibold">{step.name}</Text>
                <Text className="text-sm text-gray-600">{step.duration}</Text>
              </View>
              <View className={`px-3 py-1 rounded-full ${
                step.status === 'completed' ? 'bg-green-100' :
                step.status === 'in_progress' ? 'bg-blue-100' : 'bg-gray-100'
              }`}>
                <Text className={
                  step.status === 'completed' ? 'text-green-800' :
                  step.status === 'in_progress' ? 'text-blue-800' : 'text-gray-800'
                }>
                  {step.status.replace('_', ' ')}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        <Card className="p-4">
          <Text className="text-lg font-bold mb-4">Actions</Text>
          <TouchableOpacity className="bg-yellow-500 p-4 rounded-lg mb-3">
            <Text className="text-white text-center font-semibold">Pause Workflow</Text>
          </TouchableOpacity>
          <TouchableOpacity className="bg-red-500 p-4 rounded-lg">
            <Text className="text-white text-center font-semibold">Terminate Workflow</Text>
          </TouchableOpacity>
        </Card>
      </View>
    </ScrollView>
  );
}
EOF

echo "Mobile admin screens created successfully!"
