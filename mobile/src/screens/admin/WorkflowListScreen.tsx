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
