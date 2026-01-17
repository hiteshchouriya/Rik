#!/usr/bin/env python3
"""
Life Transformation Assistant Backend API Test Suite
Tests all backend endpoints comprehensively
"""

import requests
import json
import uuid
from datetime import datetime, date, timedelta
import sys

# API Base URL from frontend .env
API_BASE_URL = "https://mindtracker-18.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.base_url = API_BASE_URL
        self.test_user_id = None
        self.test_task_id = None
        self.results = {
            "passed": 0,
            "failed": 0,
            "errors": []
        }
    
    def log_result(self, test_name, success, message=""):
        if success:
            self.results["passed"] += 1
            print(f"✅ {test_name}: PASSED {message}")
        else:
            self.results["failed"] += 1
            self.results["errors"].append(f"{test_name}: {message}")
            print(f"❌ {test_name}: FAILED - {message}")
    
    def test_api_root(self):
        """Test API root endpoint"""
        try:
            response = requests.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                if "Life Transformation Assistant API" in data.get("message", ""):
                    self.log_result("API Root", True, "API is accessible")
                    return True
                else:
                    self.log_result("API Root", False, f"Unexpected response: {data}")
            else:
                self.log_result("API Root", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("API Root", False, f"Connection error: {str(e)}")
        return False
    
    def test_user_management(self):
        """Test user creation, retrieval, and update"""
        # Test user creation
        user_data = {
            "name": "Sarah Johnson",
            "age": 28,
            "current_role": "Software Developer",
            "goal_role": "Project Manager",
            "wake_time": "06:00",
            "sleep_time": "22:00",
            "work_start": "09:00",
            "work_end": "18:00",
            "assistant_mode": "moderate",
            "habits_to_build": ["Exercise", "Reading", "Meditation"],
            "habits_to_quit": ["Social Media Scrolling", "Late Night Snacking"],
            "goals": ["Get PMP certification", "Lead a team project", "Improve communication skills"]
        }
        
        try:
            # Create user
            response = requests.post(f"{self.base_url}/users", json=user_data)
            if response.status_code == 200:
                user = response.json()
                self.test_user_id = user["id"]
                self.log_result("User Creation", True, f"User created with ID: {self.test_user_id}")
                
                # Test user retrieval
                response = requests.get(f"{self.base_url}/users/{self.test_user_id}")
                if response.status_code == 200:
                    retrieved_user = response.json()
                    if retrieved_user["name"] == user_data["name"]:
                        self.log_result("User Retrieval", True, "User data retrieved correctly")
                    else:
                        self.log_result("User Retrieval", False, "Retrieved data doesn't match")
                else:
                    self.log_result("User Retrieval", False, f"Status: {response.status_code}")
                
                # Test user update
                update_data = user_data.copy()
                update_data["assistant_mode"] = "strict"
                response = requests.put(f"{self.base_url}/users/{self.test_user_id}", json=update_data)
                if response.status_code == 200:
                    updated_user = response.json()
                    if updated_user["assistant_mode"] == "strict":
                        self.log_result("User Update", True, "User updated successfully")
                    else:
                        self.log_result("User Update", False, "Update not reflected")
                else:
                    self.log_result("User Update", False, f"Status: {response.status_code}")
                
                return True
            else:
                self.log_result("User Creation", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_result("User Management", False, f"Error: {str(e)}")
        return False
    
    def test_habit_tracking(self):
        """Test habit logging, retrieval, and streaks"""
        if not self.test_user_id:
            self.log_result("Habit Tracking", False, "No test user available")
            return False
        
        today = datetime.now().strftime("%Y-%m-%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        try:
            # Log habits for today
            habits_to_log = [
                {"user_id": self.test_user_id, "habit_name": "Exercise", "habit_type": "build", "completed": True, "date": today, "notes": "30 min workout"},
                {"user_id": self.test_user_id, "habit_name": "Reading", "habit_type": "build", "completed": True, "date": today, "notes": "Read 20 pages"},
                {"user_id": self.test_user_id, "habit_name": "Social Media Scrolling", "habit_type": "quit", "completed": False, "date": today}
            ]
            
            for habit in habits_to_log:
                response = requests.post(f"{self.base_url}/habits/log", json=habit)
                if response.status_code != 200:
                    self.log_result("Habit Logging", False, f"Failed to log {habit['habit_name']}: {response.status_code}")
                    return False
            
            self.log_result("Habit Logging", True, "All habits logged successfully")
            
            # Test habit retrieval for date
            response = requests.get(f"{self.base_url}/habits/{self.test_user_id}/{today}")
            if response.status_code == 200:
                habits = response.json()
                if len(habits) == 3:
                    self.log_result("Habit Retrieval", True, f"Retrieved {len(habits)} habits for today")
                else:
                    self.log_result("Habit Retrieval", False, f"Expected 3 habits, got {len(habits)}")
            else:
                self.log_result("Habit Retrieval", False, f"Status: {response.status_code}")
            
            # Log habits for yesterday to test streaks
            yesterday_habits = [
                {"user_id": self.test_user_id, "habit_name": "Exercise", "habit_type": "build", "completed": True, "date": yesterday},
                {"user_id": self.test_user_id, "habit_name": "Reading", "habit_type": "build", "completed": True, "date": yesterday}
            ]
            
            for habit in yesterday_habits:
                requests.post(f"{self.base_url}/habits/log", json=habit)
            
            # Test habit streaks
            response = requests.get(f"{self.base_url}/habits/{self.test_user_id}/streaks")
            if response.status_code == 200:
                streaks = response.json()
                if "Exercise" in streaks and "Reading" in streaks:
                    self.log_result("Habit Streaks", True, f"Streaks calculated: {streaks}")
                else:
                    self.log_result("Habit Streaks", False, f"Missing expected habits in streaks: {streaks}")
            else:
                self.log_result("Habit Streaks", False, f"Status: {response.status_code}")
            
            return True
        except Exception as e:
            self.log_result("Habit Tracking", False, f"Error: {str(e)}")
        return False
    
    def test_daily_logs(self):
        """Test daily log creation and retrieval"""
        if not self.test_user_id:
            self.log_result("Daily Logs", False, "No test user available")
            return False
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        try:
            # Create daily log
            log_data = {
                "user_id": self.test_user_id,
                "date": today,
                "mood": 4,
                "energy_level": 3,
                "productivity_score": 4,
                "activities": ["Morning workout", "Team meeting", "Code review"],
                "notes": "Good productive day overall",
                "wake_time_actual": "06:15",
                "sleep_time_actual": "22:30"
            }
            
            response = requests.post(f"{self.base_url}/daily-log", json=log_data)
            if response.status_code == 200:
                daily_log = response.json()
                self.log_result("Daily Log Creation", True, "Daily log created successfully")
                
                # Test daily log retrieval
                response = requests.get(f"{self.base_url}/daily-log/{self.test_user_id}/{today}")
                if response.status_code == 200:
                    retrieved_log = response.json()
                    if retrieved_log and retrieved_log["mood"] == 4:
                        self.log_result("Daily Log Retrieval", True, "Daily log retrieved correctly")
                    else:
                        self.log_result("Daily Log Retrieval", False, "Retrieved data doesn't match")
                else:
                    self.log_result("Daily Log Retrieval", False, f"Status: {response.status_code}")
                
                # Test recent daily logs
                response = requests.get(f"{self.base_url}/daily-logs/{self.test_user_id}")
                if response.status_code == 200:
                    logs = response.json()
                    if len(logs) >= 1:
                        self.log_result("Recent Daily Logs", True, f"Retrieved {len(logs)} recent logs")
                    else:
                        self.log_result("Recent Daily Logs", False, "No logs retrieved")
                else:
                    self.log_result("Recent Daily Logs", False, f"Status: {response.status_code}")
                
                return True
            else:
                self.log_result("Daily Log Creation", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_result("Daily Logs", False, f"Error: {str(e)}")
        return False
    
    def test_task_management(self):
        """Test task creation, retrieval, completion, and deletion"""
        if not self.test_user_id:
            self.log_result("Task Management", False, "No test user available")
            return False
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        try:
            # Create tasks
            tasks_to_create = [
                {"user_id": self.test_user_id, "title": "Review PMP study materials", "description": "Go through chapter 5", "date": today, "priority": "high", "scheduled_time": "14:00"},
                {"user_id": self.test_user_id, "title": "Team standup meeting", "description": "Daily sync with team", "date": today, "priority": "medium", "scheduled_time": "09:30"},
                {"user_id": self.test_user_id, "title": "Code review for new feature", "date": today, "priority": "high"}
            ]
            
            created_tasks = []
            for task_data in tasks_to_create:
                response = requests.post(f"{self.base_url}/tasks", json=task_data)
                if response.status_code == 200:
                    task = response.json()
                    created_tasks.append(task)
                else:
                    self.log_result("Task Creation", False, f"Failed to create task: {response.status_code}")
                    return False
            
            self.log_result("Task Creation", True, f"Created {len(created_tasks)} tasks")
            self.test_task_id = created_tasks[0]["id"]
            
            # Test task retrieval for date
            response = requests.get(f"{self.base_url}/tasks/{self.test_user_id}/{today}")
            if response.status_code == 200:
                tasks = response.json()
                if len(tasks) == 3:
                    self.log_result("Task Retrieval", True, f"Retrieved {len(tasks)} tasks for today")
                else:
                    self.log_result("Task Retrieval", False, f"Expected 3 tasks, got {len(tasks)}")
            else:
                self.log_result("Task Retrieval", False, f"Status: {response.status_code}")
            
            # Test task completion
            response = requests.put(f"{self.base_url}/tasks/{self.test_task_id}/complete?completed=true")
            if response.status_code == 200:
                completed_task = response.json()
                if completed_task["completed"]:
                    self.log_result("Task Completion", True, "Task marked as completed")
                else:
                    self.log_result("Task Completion", False, "Task completion not reflected")
            else:
                self.log_result("Task Completion", False, f"Status: {response.status_code}")
            
            # Test task deletion
            task_to_delete = created_tasks[1]["id"]
            response = requests.delete(f"{self.base_url}/tasks/{task_to_delete}")
            if response.status_code == 200:
                self.log_result("Task Deletion", True, "Task deleted successfully")
            else:
                self.log_result("Task Deletion", False, f"Status: {response.status_code}")
            
            return True
        except Exception as e:
            self.log_result("Task Management", False, f"Error: {str(e)}")
        return False
    
    def test_ai_chat(self):
        """Test AI chat functionality"""
        if not self.test_user_id:
            self.log_result("AI Chat", False, "No test user available")
            return False
        
        try:
            # Test chat message
            chat_data = {
                "user_id": self.test_user_id,
                "message": "Hi! I'm feeling motivated today. Can you help me plan my evening routine to stay productive?"
            }
            
            response = requests.post(f"{self.base_url}/chat", json=chat_data)
            if response.status_code == 200:
                chat_response = response.json()
                if "response" in chat_response and len(chat_response["response"]) > 10:
                    self.log_result("AI Chat Message", True, f"AI responded with {len(chat_response['response'])} characters")
                else:
                    self.log_result("AI Chat Message", False, "AI response too short or missing")
            else:
                self.log_result("AI Chat Message", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
            
            # Test chat history
            response = requests.get(f"{self.base_url}/chat/{self.test_user_id}/history")
            if response.status_code == 200:
                history = response.json()
                if len(history) >= 2:  # Should have user message and assistant response
                    self.log_result("Chat History", True, f"Retrieved {len(history)} messages")
                else:
                    self.log_result("Chat History", False, f"Expected at least 2 messages, got {len(history)}")
            else:
                self.log_result("Chat History", False, f"Status: {response.status_code}")
            
            return True
        except Exception as e:
            self.log_result("AI Chat", False, f"Error: {str(e)}")
        return False
    
    def test_daily_analysis(self):
        """Test daily analysis generation and retrieval"""
        if not self.test_user_id:
            self.log_result("Daily Analysis", False, "No test user available")
            return False
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        try:
            # Generate daily analysis
            response = requests.post(f"{self.base_url}/analysis/{self.test_user_id}?date={today}")
            if response.status_code == 200:
                analysis = response.json()
                required_fields = ["summary", "achievements", "improvements", "recommendations", "overall_score"]
                if all(field in analysis for field in required_fields):
                    self.log_result("Daily Analysis Generation", True, f"Analysis generated with score: {analysis['overall_score']}")
                else:
                    self.log_result("Daily Analysis Generation", False, f"Missing required fields: {analysis}")
            else:
                self.log_result("Daily Analysis Generation", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
            
            # Test analysis retrieval
            response = requests.get(f"{self.base_url}/analysis/{self.test_user_id}/{today}")
            if response.status_code == 200:
                retrieved_analysis = response.json()
                if retrieved_analysis and "summary" in retrieved_analysis:
                    self.log_result("Daily Analysis Retrieval", True, "Analysis retrieved successfully")
                else:
                    self.log_result("Daily Analysis Retrieval", False, "Retrieved analysis is incomplete")
            else:
                self.log_result("Daily Analysis Retrieval", False, f"Status: {response.status_code}")
            
            return True
        except Exception as e:
            self.log_result("Daily Analysis", False, f"Error: {str(e)}")
        return False
    
    def test_user_stats(self):
        """Test user statistics endpoint"""
        if not self.test_user_id:
            self.log_result("User Stats", False, "No test user available")
            return False
        
        try:
            response = requests.get(f"{self.base_url}/stats/{self.test_user_id}")
            if response.status_code == 200:
                stats = response.json()
                required_fields = ["habit_completion", "task_completion", "mood_data"]
                if all(field in stats for field in required_fields):
                    self.log_result("User Stats", True, f"Stats retrieved with {len(stats['habit_completion'])} data points")
                else:
                    self.log_result("User Stats", False, f"Missing required fields: {stats}")
            else:
                self.log_result("User Stats", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("User Stats", False, f"Error: {str(e)}")
    
    def run_all_tests(self):
        """Run all backend tests"""
        print(f"🚀 Starting Life Transformation Assistant Backend API Tests")
        print(f"📍 API Base URL: {self.base_url}")
        print("=" * 60)
        
        # Test API connectivity first
        if not self.test_api_root():
            print("❌ Cannot connect to API. Stopping tests.")
            return False
        
        # Run all tests in sequence
        self.test_user_management()
        self.test_habit_tracking()
        self.test_daily_logs()
        self.test_task_management()
        self.test_ai_chat()
        self.test_daily_analysis()
        self.test_user_stats()
        
        # Print summary
        print("=" * 60)
        print(f"📊 TEST SUMMARY")
        print(f"✅ Passed: {self.results['passed']}")
        print(f"❌ Failed: {self.results['failed']}")
        
        if self.results['errors']:
            print("\n🔍 FAILED TESTS:")
            for error in self.results['errors']:
                print(f"   • {error}")
        
        success_rate = (self.results['passed'] / (self.results['passed'] + self.results['failed'])) * 100 if (self.results['passed'] + self.results['failed']) > 0 else 0
        print(f"\n📈 Success Rate: {success_rate:.1f}%")
        
        return self.results['failed'] == 0

if __name__ == "__main__":
    tester = BackendTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)