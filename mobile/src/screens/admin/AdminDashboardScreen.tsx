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
