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
