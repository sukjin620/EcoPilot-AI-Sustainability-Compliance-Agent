import React, { useState, useEffect, useRef  } from 'react';
import './App.css';
import './index.css';
import { Upload, FileText, AlertCircle, CheckCircle, TrendingUp, Activity, BarChart3, RefreshCw, Leaf, LogOut } from 'lucide-react';
import { Amplify } from 'aws-amplify';
import { uploadData } from 'aws-amplify/storage';
import { get } from 'aws-amplify/api';
import { withAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import awsExports from './aws-exports';

Amplify.configure(awsExports);

function EcoPilotDashboard({ signOut, user }) {
  const [activeTab, setActiveTab] = useState('upload');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [assessments, setAssessments] = useState([]);
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isFetchingRef = useRef(false);

  // Upload file to S3 using Amplify Storage
  const uploadFileToS3 = async (file) => {
    try {
      console.log('Starting upload for:', file.name);
      
      const result = await uploadData({
        path: `raw-data/${file.name}`,
        data: file,
        options: {
          contentType: file.type,
          onProgress: ({ transferredBytes, totalBytes }) => {
            const progress = Math.round((transferredBytes / totalBytes) * 100);
            console.log(`Upload progress: ${progress}%`);
          }
        }
      }).result;

      console.log('Upload succeeded:', result);
      
      return {
        fileId: result.path,
        fileName: file.name,
        bucket: awsExports.aws_user_files_s3_bucket,
        key: result.path,
        status: 'uploaded'
      };
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  };

  // Fetch assessments from API Gateway
  const fetchAssessments = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const restOperation = get({
        apiName: 'ecopilotAPI',
        path: '/assessments'
      });
      
      const response = await restOperation.response;
      const data = await response.body.json();
      
      let assessmentsList = [];
      
      if (data.items && Array.isArray(data.items)) {
        assessmentsList = data.items;
      } else if (Array.isArray(data)) {
        assessmentsList = data;
      } else if (data.Items && Array.isArray(data.Items)) {
        assessmentsList = data.Items;
      }
      
      setAssessments(assessmentsList);
      
    } catch (err) {
      console.error('Error fetching assessments:', err);
      setError('Failed to load assessments: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Add polling function
  const pollForAssessment = async (fileId, maxAttempts = 20, interval = 3000) => {
    console.log(`🔍 Starting to poll for: ${fileId}`);
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, interval));
      
      try {
        const restOperation = get({
          apiName: 'ecopilotAPI',
          path: '/assessments'
        });
        
        const response = await restOperation.response;
        const data = await response.body.json();
      
        
        if (data.items && Array.isArray(data.items)) {
          console.log(`Found ${data.items.length} assessments in database`);
          
          // Log all file_ids to see what we're comparing
          data.items.forEach((item, idx) => {
            console.log(`  [${idx}] file_id: "${item.file_id}", source_file: "${item.source_file}"`);
          });
          
          // Try multiple matching strategies
          const assessment = data.items.find(a => {
            const matches = 
              a.file_id === fileId || 
              a.file_id?.includes(fileId) ||
              fileId.includes(a.file_id) ||
              a.source_file === fileId.split('/').pop() ||
              a.file_id === fileId.split('/').pop();
            
            if (matches) {
              console.log(`✅ MATCH FOUND with assessment:`, a);
            }
            return matches;
          });
          
          if (assessment) {
            return assessment;
          } else {
            console.log('❌ No matching assessment found yet');
          }
        } else {
          console.log('⚠️ No items in response or invalid format');
        }
        
      } catch (err) {
        console.error('❌ Polling error:', err);
      }
    }
    
    throw new Error('Polling timeout');
  };

  // Update handleFiles function
  const handleFiles = async (files) => {
    const file = files[0];
    
    // Validate file type
    const allowedTypes = ['.csv', '.json', '.pdf'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
      alert(`Invalid file type. Please upload ${allowedTypes.join(', ')} files only.`);
      return;
    }
    
    setUploading(true);
    setError(null);

    try {
      // Upload to S3 
      console.log('Uploading file to S3:', file.name);
      const result = await uploadFileToS3(file);
      console.log('S3 upload complete:', result);
      
      // Add to uploaded files list
      const newFile = {
        name: file.name,
        size: file.size,
        type: file.type,
        uploadTime: new Date().toISOString(),
        fileId: result.fileId,
        status: 'processing'
      };
      
      setUploadedFiles([newFile, ...uploadedFiles]);
      setUploading(false);

        // Determine file size category
      const sizeInMB = file.size / (1024 * 1024);
      const isLargeFile = sizeInMB > 1; // Files over 1MB are "large"
      
      const estimatedTime = isLargeFile ? '2-3 minutes' : '60 seconds';
      
      alert(`✅ File uploaded successfully!\n\n` +
            `📊 File size: ${formatFileSize(file.size)}\n` +
            `⏱️ Estimated processing time: ${estimatedTime}\n\n` +
            `🤖 AI agents are processing your data:\n` +
            `1. Data Processor extracting metrics\n` +
            `2. Compliance Agent analyzing standards\n\n` +
            `You can check the Dashboard tab anytime - results will appear when ready.`);
      
      // Start polling with longer timeout for large files
      const maxAttempts = isLargeFile ? 60 : 40; // Up to 5 minutes for large files
      
      // Poll for results (non-blocking)
      pollForAssessment(result.fileId, maxAttempts, 3000)
        .then(assessment => {
          console.log('Processing complete!', assessment);
          
          setUploadedFiles(prev => 
            prev.map(f => 
              f.fileId === result.fileId 
                ? { ...f, status: 'completed' }
                : f
            )
          );
          
          if (activeTab === 'dashboard') {
            fetchAssessments();
          }
          
          alert('✅ Compliance analysis complete! Check the Dashboard.');
        })
        .catch(err => {
          console.error('Polling timeout:', err);
          
          setUploadedFiles(prev => 
            prev.map(f => 
              f.fileId === result.fileId 
                ? { ...f, status: 'check_dashboard' }
                : f
            )
          );

          console.log(`Processing ${file.name} is taking longer. Results will appear in Dashboard when ready.`);
        });
      
    } catch (error) {
      console.error('Upload error:', error);
      setUploading(false);
      setError('Upload failed: ' + error.message);
      alert('❌ Upload failed: ' + error.message);
    }
  };

  useEffect(() => {
    if (activeTab === 'dashboard' && !isFetchingRef.current) {
      isFetchingRef.current = true;
      fetchAssessments().finally(() => {
        isFetchingRef.current = false;
      });
    }
  }, [activeTab]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const getFileStatusDisplay = (status) => {
    switch (status) {
      case 'processing':
        return { text: 'Processing...', class: 'bg-blue-100 text-blue-700 animate-pulse' };
      case 'completed':
        return { text: 'Completed', class: 'bg-green-100 text-green-700' };
      case 'check_dashboard':
        return { text: 'Check Dashboard', class: 'bg-yellow-100 text-yellow-700' };
      default:
        return { text: status, class: 'bg-gray-100 text-gray-700' };
    }
  };


  const getStatusColor = (status) => {
    switch (status) {
      case 'compliant': return 'text-green-600 bg-green-50';
      case 'at_risk': return 'text-yellow-600 bg-yellow-50';
      case 'non_compliant': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Leaf className="w-8 h-8 text-green-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">EcoPilot</h1>
                <p className="text-sm text-gray-500">AI-Powered ESG Compliance Platform</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">👤 {user.signInDetails?.loginId || user.username}</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    activeTab === 'upload'
                      ? 'bg-green-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Upload className="w-4 h-4 inline mr-2" />
                  Upload
                </button>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    activeTab === 'dashboard'
                      ? 'bg-green-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 inline mr-2" />
                  Dashboard
                </button>
                <button
                  onClick={signOut}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-all"
                >
                  <LogOut className="w-4 h-4 inline mr-2" />
                  Sign Out
                </button>
    
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
            <div className="flex">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
              <div className="ml-3">
                <p className="text-sm text-yellow-700">{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'upload' && (
          <div className="space-y-6">
            {/* Upload Section */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Upload ESG Data</h2>
              
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                  dragActive
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-xl font-medium text-gray-700 mb-2">
                  Drag and drop your file here
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  Supported formats: CSV, JSON, PDF
                </p>
                <label className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer transition-all shadow-md hover:shadow-lg">
                  <FileText className="w-5 h-5 mr-2" />
                  Choose File
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileInput}
                    accept=".csv,.json,.pdf"
                  />
                </label>
              </div>

              {uploading && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                    <div>
                      <p className="text-blue-800 font-medium">Uploading to S3...</p>
                      <p className="text-blue-600 text-sm">Your file will be processed automatically</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Uploads */}
              {uploadedFiles.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Uploads</h3>
                  <div className="space-y-3">
                    {uploadedFiles.map((file, idx) => {
                      const statusInfo = getFileStatusDisplay(file.status);
                      return(
                      <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center space-x-3">
                          <FileText className="w-5 h-5 text-gray-500" />
                          <div>
                            <p className="font-medium text-gray-900">{file.name}</p>
                            <p className="text-sm text-gray-500">
                              {formatFileSize(file.size)} • {formatDate(file.uploadTime)}
                            </p>
                          </div>
                        </div>
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full font-medium">
                          {statusInfo.text}
                        </span>
                      </div>
                    );
                })}
                  </div>
                </div>
              )}

              {/* Info Box */}
              <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">🤖 How it works:</h4>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Upload your ESG data file (CSV, JSON, or PDF)</li>
                  <li>AI Data Processor extracts sustainability metrics</li>
                  <li>AI Compliance Agent analyzes against global standards</li>
                  <li>View detailed compliance report in Dashboard</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Total Assessments</p>
                    <p className="text-3xl font-bold text-gray-900">{assessments.length}</p>
                  </div>
                  <BarChart3 className="w-10 h-10 text-blue-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Avg Compliance Score</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {assessments.length > 0
                        ? Math.round(assessments.reduce((sum, a) => sum + (a.compliance_score || 0), 0) / assessments.length)
                        : 0}
                    </p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-green-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Critical Violations</p>
                    <p className="text-3xl font-bold text-red-600">
                      {assessments.reduce((sum, a) => sum + (a.critical_violations || 0), 0)}
                    </p>
                  </div>
                  <AlertCircle className="w-10 h-10 text-red-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Data Quality</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {assessments.length > 0
                        ? Math.round(assessments.reduce((sum, a) => sum + (a.data_quality_score || 0), 0) / assessments.length)
                        : 0}%
                    </p>
                  </div>
                  <Activity className="w-10 h-10 text-purple-500" />
                </div>
              </div>
            </div>

            {/* Assessments List */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Compliance Assessments</h2>
                <button
                  onClick={fetchAssessments}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all flex items-center space-x-2"
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
                  <p className="text-gray-500">Loading assessments from DynamoDB...</p>
                </div>
              ) : assessments.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 mb-2">No assessments yet.</p>
                  <p className="text-sm text-gray-400">Upload a file to get started with AI-powered compliance analysis.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {assessments.map((assessment, idx) => (
                    <div
                      key={assessment.assessment_id || idx}
                      className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => setSelectedAssessment(assessment)}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">
                            {assessment.source_file || assessment.file_id || 'Unknown File'}
                          </h3>
                          <p className="text-sm text-gray-500">{formatDate(assessment.timestamp)}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(assessment.overall_status)}`}>
                          {(assessment.overall_status || 'unknown').replace('_', ' ').toUpperCase()}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Compliance Score</p>
                          <p className="text-2xl font-bold text-gray-900">{assessment.compliance_score || 0}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Data Quality</p>
                          <p className="text-2xl font-bold text-gray-900">{assessment.data_quality_score || 0}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Total Violations</p>
                          <p className="text-2xl font-bold text-yellow-600">{assessment.total_violations || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Critical Issues</p>
                          <p className="text-2xl font-bold text-red-600">{assessment.critical_violations || 0}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detailed Assessment View Modal */}
            {selectedAssessment && selectedAssessment.assessment_data && (
              <div 
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
                onClick={() => setSelectedAssessment(null)}
              >
                <div 
                  className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between z-10">
                    <h2 className="text-2xl font-bold text-gray-900">Assessment Details</h2>
                    <button
                      onClick={() => setSelectedAssessment(null)}
                      className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                    >
                      ×
                    </button>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Violations */}
                    {selectedAssessment.assessment_data.violations && selectedAssessment.assessment_data.violations.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Violations & Issues</h3>
                        <div className="space-y-3">
                          {selectedAssessment.assessment_data.violations.map((violation, idx) => (
                            <div key={idx} className="border border-gray-200 rounded-lg p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h4 className="font-semibold text-gray-900">
                                    {(violation.category || 'unknown').replace('_', ' ').toUpperCase()}
                                  </h4>
                                  <p className="text-sm text-gray-600 mt-1">{violation.standard}</p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getSeverityColor(violation.severity)}`}>
                                  {(violation.severity || 'unknown').toUpperCase()}
                                </span>
                              </div>
                              <p className="text-gray-700 mb-3">{violation.gap_description}</p>
                              {violation.actual_value !== undefined && (
                                <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                                  <div>
                                    <span className="text-gray-500">Actual: </span>
                                    <span className="font-medium">{violation.actual_value}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Threshold: </span>
                                    <span className="font-medium">{violation.threshold_value}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Deviation: </span>
                                    <span className="font-medium text-red-600">{violation.deviation_percentage}%</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Timeline: </span>
                                    <span className="font-medium">{violation.timeline}</span>
                                  </div>
                                </div>
                              )}
                              <div className="bg-blue-50 p-3 rounded-lg">
                                <p className="text-sm font-medium text-blue-900 mb-1">Recommendation:</p>
                                <p className="text-sm text-blue-800">{violation.recommendation}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Strengths */}
                    {selectedAssessment.assessment_data.strengths && selectedAssessment.assessment_data.strengths.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">Strengths</h3>
                        <div className="space-y-2">
                          {selectedAssessment.assessment_data.strengths.map((strength, idx) => (
                            <div key={idx} className="flex items-start space-x-2">
                              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                              <p className="text-gray-700">{strength}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Next Steps */}
                    {selectedAssessment.assessment_data.next_steps && selectedAssessment.assessment_data.next_steps.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">Next Steps</h3>
                        <ol className="space-y-2">
                          {selectedAssessment.assessment_data.next_steps.map((step, idx) => (
                            <li key={idx} className="flex items-start space-x-3">
                              <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                                {idx + 1}
                              </span>
                              <p className="text-gray-700 pt-0.5">{step}</p>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Missing Metrics */}
                    {selectedAssessment.assessment_data.missing_metrics && selectedAssessment.assessment_data.missing_metrics.length > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-yellow-900 mb-2 flex items-center">
                          <AlertCircle className="w-5 h-5 mr-2" />
                          Missing Metrics
                        </h3>
                        <p className="text-sm text-yellow-800 mb-2">
                          The following metrics were not found in your data:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selectedAssessment.assessment_data.missing_metrics.map((metric, idx) => (
                            <span key={idx} className="px-3 py-1 bg-yellow-200 text-yellow-800 rounded-full text-sm">
                              {metric.replace('_', ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default withAuthenticator(EcoPilotDashboard);