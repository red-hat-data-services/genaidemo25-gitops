import React, { useState, useEffect } from 'react';
import '@patternfly/patternfly/patternfly.min.css';
import '@patternfly/patternfly/patternfly-addons.css';
import { SignOutAltIcon } from '@patternfly/react-icons';
import {
  Page,
  PageSection,
  Card,
  CardBody,
  Title,
  LoginPage,
  LoginMainBody,
  LoginMainFooter,
  Button,
  Alert,
  Spinner,
  ClipboardCopy,
  ClipboardCopyVariant,
  Grid,
  GridItem,
  CardHeader,
  CardTitle,
  Divider,
  Masthead,
  MastheadMain,
  MastheadBrand,
  MastheadContent,
  Brand,
  Flex,
  FlexItem,
  Stack,
  StackItem,
  EmptyState,
  EmptyStateVariant,
  EmptyStateBody,
  Bullseye,
  Form,
  FormGroup,
  FormHelperText,
  TextInput
} from '@patternfly/react-core';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
import './App.css';

interface ClusterInfo {
  name: string;
  url: string;
  username: string;
  password: string;
}

interface User {
  email: string;
  token: string;
  cluster?: ClusterInfo;
}

const Header: React.FC<{ onLogout: () => void }> = ({ onLogout }) => (
  <Masthead role="banner" aria-label="page masthead">
    <MastheadMain>
      <MastheadBrand>
        <Brand
          className="workshop-brand"
          src="https://www.redhat.com/cms/managed-files/Logo-RedHat-Hat-Color-RGB.svg"
          alt="Red Hat Workshop"
          heights={{ default: '40px' }}
        />
      </MastheadBrand>
    </MastheadMain>
    <MastheadContent>
      <Button 
        variant="secondary" 
        onClick={onLogout}
        icon={<SignOutAltIcon />}
        iconPosition="left"
      >
        Logout
      </Button>
    </MastheadContent>
  </Masthead>
);

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('workshop_token');
    if (token) {
      fetchUserCluster(token);
    }
  }, []);

  const fetchUserCluster = async (token: string) => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/user/cluster', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUser({
          email: 'user@example.com', // We don't store email in token, so using placeholder
          token,
          cluster: data.cluster
        });
      } else if (response.status === 401) {
        // Token expired, clear it
        localStorage.removeItem('workshop_token');
        setUser(null);
      }
    } catch (error) {
      console.error('Error fetching user cluster:', error);
      setError('Failed to fetch cluster information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('workshop_token', data.token);
        setUser({
          email,
          token: data.token,
          cluster: data.cluster
        });
        setSuccess('Successfully logged in and cluster assigned!');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('workshop_token');
      if (token) {
        // Call logout API to release cluster and demo user
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });
      }
    } catch (error) {
      console.error('Logout API error:', error);
      // Continue with logout even if API call fails
    } finally {
      // Always clear local state
      localStorage.removeItem('workshop_token');
      setUser(null);
      setError(null);
      setSuccess(null);
    }
  };

  const handleReleaseCluster = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = localStorage.getItem('workshop_token');
      if (!token) {
        setError('No authentication token found');
        return;
      }

      const response = await fetch('/api/user/release', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setUser(prev => prev ? { ...prev, cluster: undefined } : null);
        setSuccess('Cluster released successfully');
      } else {
        setError(data.error || 'Failed to release cluster');
      }
    } catch (error) {
      console.error('Release cluster error:', error);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const LoginForm: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (email && password) {
        handleLogin(email, password);
      }
    };

    return (
      <div className="login-page-container">
        {/* Error messages positioned at top right */}
        {(error || success) && (
          <div className="login-error-container">
            {error && (
              <Alert variant="danger" title="Error" isInline>
                {error}
              </Alert>
            )}
            {success && (
              <Alert variant="success" title="Success" isInline>
                {success}
              </Alert>
            )}
          </div>
        )}
        
        <LoginPage
          brandImgSrc="https://www.redhat.com/cms/managed-files/Logo-RedHat-Hat-Color-RGB.svg"
          brandImgAlt="Red Hat"
          loginTitle="Red Hat Openshift AI Workshop"
          loginSubtitle="Enter your credentials to get assigned a cluster"
        >
          <LoginMainBody>
            
            <Form onSubmit={handleSubmit}>
              <FormGroup label="Email address" isRequired fieldId="email">
                <TextInput
                  isRequired
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={(_, value) => setEmail(value)}
                  autoComplete="email"
                  placeholder="Enter your email address"
                />
              </FormGroup>
              
              <FormGroup label="Password" isRequired fieldId="password">
                <TextInput
                  isRequired
                  type="password"
                  id="password"
                  name="password"
                  value={password}
                  onChange={(_, value) => setPassword(value)}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  minLength={4}
                />
                <FormHelperText>
                  Password must be at least 4 characters long
                </FormHelperText>
              </FormGroup>
              
              <FormGroup>
                <Button
                  type="submit"
                  variant="primary"
                  isBlock
                  isLoading={isLoading}
                  isDisabled={!email || !password || password.length < 4}
                  size="lg"
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </Button>
              </FormGroup>
            </Form>
          </LoginMainBody>
          <LoginMainFooter>
            <p className="pf-v6-u-font-size-sm pf-v6-u-color-200">
              This is a workshop environment. Clusters are assigned on a first-come, first-served basis.
            </p>
          </LoginMainFooter>
        </LoginPage>
      </div>
    );
  };

  const Dashboard: React.FC = () => {
    if (!user) return null;

    return (
      <Page
        masthead={<Header onLogout={handleLogout} />}
      >
        <PageSection>
          <Stack hasGutter>
            <StackItem>
              <Flex
                justifyContent={{ default: 'justifyContentSpaceBetween' }}
                alignItems={{ default: 'alignItemsFlexStart' }}
              >
                <FlexItem flex={{ default: 'flex_1' }}>
                  <Title headingLevel="h1" size="2xl">
                    Red Hat Workshop Dashboard
                  </Title>
                  <p className="pf-v6-u-color-200">
                    Welcome back! Here are your cluster details.
                  </p>
                </FlexItem>
              </Flex>
            </StackItem>
            
            {(error || success) && (
              <StackItem>
                {error && (
                  <Alert variant="danger" title="Error" isInline>
                    {error}
                  </Alert>
                )}
                {success && (
                  <Alert variant="success" title="Success" isInline>
                    {success}
                  </Alert>
                )}
              </StackItem>
            )}
          </Stack>
        </PageSection>

        <PageSection isFilled>
          {user.cluster ? (
            <Card className="cluster-info-card">
              <CardHeader>
                <Flex
                  justifyContent={{ default: 'justifyContentSpaceBetween' }}
                  alignItems={{ default: 'alignItemsCenter' }}
                >
                  <FlexItem>
                    <CardTitle>Your Assigned Cluster</CardTitle>
                  </FlexItem>
                  <FlexItem>
                    <Button
                      variant="danger"
                      onClick={handleReleaseCluster}
                      isLoading={isLoading}
                    >
                      Release Cluster
                    </Button>
                  </FlexItem>
                </Flex>
              </CardHeader>
              <CardBody>
                <Stack hasGutter>
                  <StackItem>
                    <div className="pf-v6-u-text-align-center">
                      <Title headingLevel="h2" size="lg" className="pf-v6-u-color-100 pf-v6-u-mb-sm">
                        {user.cluster.name}
                      </Title>
                      <p className="pf-v6-u-color-200 pf-v6-u-mb-md">
                        Cluster Console URL
                      </p>
                      <ClipboardCopy
                        variant={ClipboardCopyVariant.inline}
                        hoverTip="Copy"
                        clickTip="Copied!"
                      >
                        {user.cluster.url}
                      </ClipboardCopy>
                    </div>
                  </StackItem>
                  
                  <StackItem>
                    <Grid hasGutter>
                      <GridItem span={6}>
                        <div className="pf-v6-u-text-align-center">
                          <Title headingLevel="h3" size="md" className="pf-v6-u-mb-sm">
                            Demo Username
                          </Title>
                          <ClipboardCopy
                            variant={ClipboardCopyVariant.inline}
                            hoverTip="Copy"
                            clickTip="Copied!"
                          >
                            {user.cluster.username}
                          </ClipboardCopy>
                        </div>
                      </GridItem>
                      <GridItem span={6}>
                        <div className="pf-v6-u-text-align-center">
                          <Title headingLevel="h3" size="md" className="pf-v6-u-mb-sm">
                            Demo Password
                          </Title>
                          <ClipboardCopy
                            variant={ClipboardCopyVariant.inline}
                            hoverTip="Copy"
                            clickTip="Copied!"
                          >
                            {user.cluster.password}
                          </ClipboardCopy>
                        </div>
                      </GridItem>
                    </Grid>
                  </StackItem>
                  
                  <StackItem>
                    <Divider />
                  </StackItem>
                  
                  <StackItem>
                    <div className="pf-v6-u-text-align-center">
                      <Button
                        component="a"
                        href={user.cluster.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="primary"
                        icon={<ExternalLinkAltIcon />}
                        iconPosition="right"
                        size="lg"
                      >
                        Open Cluster Console
                      </Button>
                    </div>
                  </StackItem>
                </Stack>
              </CardBody>
            </Card>
          ) : (
            <EmptyState
              variant={EmptyStateVariant.lg}
            >
              <Title headingLevel="h2" size="lg">
                No Cluster Assigned
              </Title>
              <EmptyStateBody>
                You don't have a cluster assigned yet. Please log in to get assigned a cluster.
              </EmptyStateBody>
            </EmptyState>
          )}
        </PageSection>
      </Page>
    );
  };

  if (isLoading && !user) {
    return (
      <Page>
        <Bullseye>
          <Spinner size="xl" />
        </Bullseye>
      </Page>
    );
  }

  return user ? <Dashboard /> : <LoginForm />;
};

export default App;
